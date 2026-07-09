import { DiagramSyntaxError } from './errors';
import { unescape } from './text';

/**
 * Scans body lines into syntax-level events. The scanner knows nothing about
 * what a "structure" or "flowchart" diagram means — that's up to the Diagram
 * subclass that consumes these events. It only enforces the shared grammar:
 *
 *   [ID]                  - block declaration
 *   (ID) -> [ID] {label}  - edge + block declaration, label optional
 *   - text {comment}      - bullet, indentation-nested, trailing comment optional
 *
 * (), [] may never appear inside a bullet line — only {..} may trail one, as
 * a single group at the very end. \x escapes a reserved character inside text.
 */
export type ScanEvent =
	| { kind: 'block'; line: number; id: string }
	| { kind: 'edgeBlock'; line: number; from: string; id: string; label?: string }
	| { kind: 'bullet'; line: number; indent: number; text: string; comment?: string };

const BLOCK_DECL = /^\[([^\]]*)\]$/;
const EDGE_BLOCK_DECL = /^\(([^)]*)\)\s*->\s*\[([^\]]*)\]\s*(\{([^}]*)\})?$/;
const BULLET = /^(\s*)-\s?(.*)$/;

const ESCAPE_SENTINELS: Array<[string, string]> = [
	['\\(', '@@OP@@'],
	['\\)', '@@CP@@'],
	['\\[', '@@OK@@'],
	['\\]', '@@CK@@'],
	['\\{', '@@OB@@'],
	['\\}', '@@CB@@'],
	['\\\\', '@@BS@@'],
	['\\#', '@@HS@@'],
];

function protectEscapes(text: string): string {
	let out = text;
	for (const [pattern, sentinel] of ESCAPE_SENTINELS) {
		out = out.split(pattern).join(sentinel);
	}
	return out;
}

function restoreEscapes(text: string): string {
	let out = text;
	for (const [pattern, sentinel] of ESCAPE_SENTINELS) {
		out = out.split(sentinel).join(pattern[1]);
	}
	return out;
}

const RESERVED_CHARS = /[()[\]{}]/;

function parseBulletContent(raw: string, line: number): { text: string; comment?: string } {
	const protected_ = protectEscapes(raw.trim());
	const trailing = protected_.match(/^([\s\S]*?)\s*\{([^{}]*)\}$/);

	let remainder = protected_;
	let comment: string | undefined;
	if (trailing) {
		remainder = trailing[1];
		comment = trailing[2];
	}

	if (RESERVED_CHARS.test(remainder)) {
		throw new DiagramSyntaxError(
			`"(", ")", "[" and "]" cannot appear inside a bullet line — declare edges on a "[ ]" or "( ) -> [ ]" line instead ("${restoreEscapes(remainder).trim()}")`,
			line
		);
	}

	return {
		text: restoreEscapes(remainder).trim(),
		comment: comment !== undefined ? restoreEscapes(comment).trim() : undefined,
	};
}

export function scanBody(lines: string[], startLine: number): ScanEvent[] {
	const events: ScanEvent[] = [];

	for (let i = startLine; i < lines.length; i++) {
		const raw = lines[i];
		const lineNo = i + 1;
		if (!raw.trim()) {
			continue;
		}

		const bulletMatch = raw.match(BULLET);
		if (bulletMatch) {
			const indent = bulletMatch[1].length;
			const { text, comment } = parseBulletContent(bulletMatch[2], lineNo);
			events.push({ kind: 'bullet', line: lineNo, indent, text, comment });
			continue;
		}

		const trimmed = raw.trim();

		const edgeMatch = trimmed.match(EDGE_BLOCK_DECL);
		if (edgeMatch) {
			events.push({
				kind: 'edgeBlock',
				line: lineNo,
				from: unescape(edgeMatch[1].trim()),
				id: unescape(edgeMatch[2].trim()),
				label: edgeMatch[4] !== undefined ? unescape(edgeMatch[4].trim()) : undefined,
			});
			continue;
		}

		const blockMatch = trimmed.match(BLOCK_DECL);
		if (blockMatch) {
			events.push({ kind: 'block', line: lineNo, id: unescape(blockMatch[1].trim()) });
			continue;
		}

		if (trimmed.startsWith('#')) {
			throw new DiagramSyntaxError('Tags must appear before any diagram content', lineNo);
		}

		throw new DiagramSyntaxError(`Unrecognized line: "${trimmed}"`, lineNo);
	}

	return events;
}

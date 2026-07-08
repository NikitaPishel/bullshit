import { DiagramEdge, DiagramField, DiagramModel, DiagramNode } from './model';

/**
 * Parses the custom flow DSL described in the extension spec.
 *
 * Grammar summary:
 *   [ID]        - declares/activates a flow block with the given id
 *   - text       - a field belonging to the active block (title/step)
 *   - title      - a field that becomes a "list" field once indented
 *     - item      children are pushed onto the nearest shallower field
 *   (ID)         - declares an edge ID -> activeBlock (standalone line)
 *   {text}       - label attached to the most recent unlabeled edge
 *   # text       - full line comment, ignored
 *   \x           - escapes a reserved character (# ( ) [ ] { } \) inside text
 *
 * Inline tokens are also honored inside "- text" lines:
 *   (ID)   -> incoming edge ID -> activeBlock
 *   {text} -> label for the inline edge immediately preceding it
 *   [ID]   -> outgoing edge activeBlock -> ID
 */
export function parseDSL(source: string): DiagramModel {
	const nodes = new Map<string, DiagramNode>();
	const edges: DiagramEdge[] = [];

	let currentId: string | null = null;
	let lastField: DiagramField | null = null;
	let lastFieldIndent = -1;
	let lastEdge: DiagramEdge | null = null;

	const ensureNode = (id: string): DiagramNode => {
		let node = nodes.get(id);
		if (!node) {
			node = { id, fields: [] };
			nodes.set(id, node);
		}
		return node;
	};

	const lines = source.split(/\r\n|\n/);

	for (const raw of lines) {
		if (!raw.trim()) {
			continue;
		}

		const trimmed = raw.trim();

		if (trimmed.startsWith('#')) {
			continue;
		}

		// Combined edge + block declaration: (fromID) -> [toID], with optional trailing content.
		const arrowBlockMatch = trimmed.match(/^\(([^)]+)\)\s*->\s*\[([^\]]+)\](.*)$/);
		if (arrowBlockMatch) {
			const from = arrowBlockMatch[1].trim();
			const to = arrowBlockMatch[2].trim();
			ensureNode(from);
			ensureNode(to);
			const edge: DiagramEdge = { from, to };
			edges.push(edge);
			lastEdge = edge;
			currentId = to;
			lastField = null;
			lastFieldIndent = -1;
			const rest = arrowBlockMatch[3].trim();
			if (rest) {
				extractInlineTokens(rest, currentId, edges, (edge2) => (lastEdge = edge2));
			}
			continue;
		}

		// Block declaration: [ID] with optional trailing inline content on the same line.
		const blockMatch = trimmed.match(/^\[([^\]]+)\](.*)$/);
		if (blockMatch) {
			currentId = blockMatch[1].trim();
			ensureNode(currentId);
			lastField = null;
			lastFieldIndent = -1;
			const rest = blockMatch[2].trim();
			if (rest && currentId) {
				extractInlineTokens(rest, currentId, edges, (edge) => (lastEdge = edge));
			}
			continue;
		}

		if (!currentId) {
			// stray content before any block was declared; ignore
			continue;
		}

		// Standalone edge declaration: (ID) optionally followed by {label}
		const edgeMatch = trimmed.match(/^\(([^)]+)\)\s*(\{([^}]*)\})?$/);
		if (edgeMatch) {
			const from = edgeMatch[1].trim();
			const label = edgeMatch[3] !== undefined ? unescape(edgeMatch[3].trim()) : undefined;
			const edge: DiagramEdge = { from, to: currentId, label };
			edges.push(edge);
			lastEdge = edge;
			continue;
		}

		// Standalone label attached to the previous edge: {label}
		const labelMatch = trimmed.match(/^\{([^}]*)\}$/);
		if (labelMatch) {
			if (lastEdge && !lastEdge.label) {
				lastEdge.label = unescape(labelMatch[1].trim());
			}
			continue;
		}

		// Field / list item: "- text" (indentation determines nesting)
		const textMatch = raw.match(/^(\s*)-\s?(.*)$/);
		if (textMatch) {
			const indent = textMatch[1].length;
			let content = textMatch[2];
			content = extractInlineTokens(content, currentId, edges, (edge) => (lastEdge = edge));
			content = unescape(content).trim();

			const node = ensureNode(currentId);

			if (lastField && indent > lastFieldIndent) {
				lastField.items.push(content);
			} else {
				const field: DiagramField = { title: content, items: [] };
				node.fields.push(field);
				lastField = field;
				lastFieldIndent = indent;
			}
			continue;
		}
	}

	return { nodes: Array.from(nodes.values()), edges: dedupeEdges(edges) };
}

/** Merges edges that share the same from/to pair, keeping the first non-empty label. */
function dedupeEdges(edges: DiagramEdge[]): DiagramEdge[] {
	const merged = new Map<string, DiagramEdge>();
	for (const edge of edges) {
		const key = edge.from + ' ' + edge.to;
		const existing = merged.get(key);
		if (!existing) {
			merged.set(key, { ...edge });
		} else if (!existing.label && edge.label) {
			existing.label = edge.label;
		}
	}
	return Array.from(merged.values());
}

function unescape(text: string): string {
	return text.replace(/\\(.)/g, '$1');
}

/**
 * Scans free text for inline (ID), {label} and [ID] tokens, registers the
 * resulting edges, and returns the text with those tokens stripped out.
 * Reserved characters preceded by a backslash are protected from matching
 * via sentinel substrings and restored to plain characters afterwards.
 */
function extractInlineTokens(
	raw: string,
	currentId: string,
	edges: DiagramEdge[],
	onEdge: (edge: DiagramEdge) => void
): string {
	const SENTINEL_OPEN_PAREN = '@@OP@@';
	const SENTINEL_CLOSE_PAREN = '@@CP@@';
	const SENTINEL_OPEN_BRACE = '@@OB@@';
	const SENTINEL_CLOSE_BRACE = '@@CB@@';
	const SENTINEL_OPEN_BRACKET = '@@OK@@';
	const SENTINEL_CLOSE_BRACKET = '@@CK@@';

	let text = raw
		.split('\\(').join(SENTINEL_OPEN_PAREN)
		.split('\\)').join(SENTINEL_CLOSE_PAREN)
		.split('\\{').join(SENTINEL_OPEN_BRACE)
		.split('\\}').join(SENTINEL_CLOSE_BRACE)
		.split('\\[').join(SENTINEL_OPEN_BRACKET)
		.split('\\]').join(SENTINEL_CLOSE_BRACKET);

	// (ID) {label}? -> incoming edge
	text = text.replace(/\(([^)]+)\)\s*(\{([^}]*)\})?/g, (_m, id: string, _g2: string, label: string) => {
		const edge: DiagramEdge = { from: id.trim(), to: currentId, label: label ? label.trim() : undefined };
		edges.push(edge);
		onEdge(edge);
		return '';
	});

	// remaining standalone {label} -> attach to last pushed edge for this node if unlabeled
	text = text.replace(/\{([^}]*)\}/g, (_m, label: string) => {
		const last = edges[edges.length - 1];
		if (last && last.to === currentId && !last.label) {
			last.label = label.trim();
		}
		return '';
	});

	// [ID] -> outgoing edge
	text = text.replace(/\[([^\]]+)\]/g, (_m, id: string) => {
		const edge: DiagramEdge = { from: currentId, to: id.trim() };
		edges.push(edge);
		onEdge(edge);
		return '';
	});

	text = text
		.split(SENTINEL_OPEN_PAREN).join('(')
		.split(SENTINEL_CLOSE_PAREN).join(')')
		.split(SENTINEL_OPEN_BRACE).join('{')
		.split(SENTINEL_CLOSE_BRACE).join('}')
		.split(SENTINEL_OPEN_BRACKET).join('[')
		.split(SENTINEL_CLOSE_BRACKET).join(']');

	return text.replace(/\s+/g, ' ').trim();
}

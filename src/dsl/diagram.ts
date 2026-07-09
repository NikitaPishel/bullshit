import { Block, DiagramType, Edge, ParsedDiagram, blockKey } from './model';
import { ScanEvent } from './scanner';

/**
 * Shared base for the two diagram semantics. The scanner already turned the
 * source into syntax-level events; each subclass decides what those events
 * mean for its diagram type and builds up the block/edge model.
 */
export abstract class Diagram {
	readonly type: DiagramType;
	protected title: string;
	protected blocks = new Map<string, Block>();
	protected edges: Edge[] = [];

	constructor(type: DiagramType, title: string) {
		this.type = type;
		this.title = title;
	}

	abstract consume(events: ScanEvent[]): void;

	protected ensureStubBlock(id: string): Block {
		const key = blockKey(id, null);
		let block = this.blocks.get(key);
		if (!block) {
			block = { key, id, index: null, messages: [] };
			this.blocks.set(key, block);
		}
		return block;
	}

	toModel(): ParsedDiagram {
		return {
			type: this.type,
			title: this.title,
			blocks: Array.from(this.blocks.values()),
			edges: dedupeEdges(this.edges),
		};
	}
}

/** Merges edges that share the same from/to pair, keeping the first non-empty label. */
function dedupeEdges(edges: Edge[]): Edge[] {
	const merged = new Map<string, Edge>();
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

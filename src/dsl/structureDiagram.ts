import { Diagram } from './diagram';
import { DiagramSyntaxError } from './errors';
import { Message, blockKey } from './model';
import { ScanEvent } from './scanner';

/**
 * [ID] declares/activates a block. Each top-level bullet is a message on that
 * block; deeper-indented bullets nest as comments on the nearest shallower
 * message. Edges only ever come from a declaration line.
 */
export class StructureDiagram extends Diagram {
	private currentId: string | null = null;
	private lastMessage: Message | null = null;
	private lastIndent = -1;

	constructor(title: string) {
		super('structure', title);
	}

	consume(events: ScanEvent[]): void {
		for (const event of events) {
			switch (event.kind) {
				case 'block':
					this.activate(event.id);
					break;
				case 'edgeBlock': {
					const from = this.ensureStubBlock(event.from);
					this.activate(event.id);
					this.edges.push({ from: from.key, to: blockKey(event.id, null), label: event.label });
					break;
				}
				case 'bullet':
					this.consumeBullet(event);
					break;
			}
		}
	}

	private activate(id: string): void {
		const key = blockKey(id, null);
		if (!this.blocks.has(key)) {
			this.blocks.set(key, { key, id, index: null, messages: [] });
		}
		this.currentId = id;
		this.lastMessage = null;
		this.lastIndent = -1;
	}

	private consumeBullet(event: Extract<ScanEvent, { kind: 'bullet' }>): void {
		if (!this.currentId) {
			throw new DiagramSyntaxError('Message declared before any block', event.line);
		}
		if (event.comment !== undefined) {
			throw new DiagramSyntaxError('Structure diagram messages cannot carry a {comment} — comments only label flowchart transitions', event.line);
		}

		const block = this.blocks.get(blockKey(this.currentId, null))!;
		if (this.lastMessage && event.indent > this.lastIndent) {
			this.lastMessage.comments.push(event.text);
		} else {
			const message: Message = { text: event.text, comments: [] };
			block.messages.push(message);
			this.lastMessage = message;
			this.lastIndent = event.indent;
		}
	}
}

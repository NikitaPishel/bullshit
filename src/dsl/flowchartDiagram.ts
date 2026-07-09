import { Diagram } from './diagram';
import { DiagramSyntaxError } from './errors';
import { Block, Message, blockKey } from './model';
import { ScanEvent } from './scanner';

/**
 * [ID] declares/activates a flow. Each top-level bullet is its own block
 * (a step), chained in declaration order; deeper-indented bullets are detail
 * comments on the step directly above them. (from) -> [ID] connects the last
 * block of flow `from` to the first step of this flow. A trailing {comment}
 * on a step labels the transition from the previous step into this one.
 */
export class FlowchartDiagram extends Diagram {
	private currentFlowId: string | null = null;
	private stepIndex = -1;
	private baseIndent = -1;
	private lastStepKey: string | null = null;
	private pendingEdge: { from: string; label?: string } | null = null;
	private lastMessage: Message | null = null;
	private flowLastStep = new Map<string, string>();

	constructor(title: string) {
		super('flowchart', title);
	}

	consume(events: ScanEvent[]): void {
		for (const event of events) {
			switch (event.kind) {
				case 'block':
					this.activate(event.id, undefined);
					break;
				case 'edgeBlock':
					this.activate(event.id, { from: event.from, label: event.label });
					break;
				case 'bullet':
					this.consumeBullet(event);
					break;
			}
		}
	}

	private activate(id: string, incoming: { from: string; label?: string } | undefined): void {
		this.currentFlowId = id;
		this.stepIndex = -1;
		this.baseIndent = -1;
		this.lastStepKey = null;
		this.lastMessage = null;
		this.pendingEdge = incoming ? { from: this.resolveLastStepKey(incoming.from), label: incoming.label } : null;
	}

	private resolveLastStepKey(flowId: string): string {
		const existing = this.flowLastStep.get(flowId);
		if (existing) {
			return existing;
		}
		// Flow referenced before it has any steps of its own — anchor the edge to a stub.
		const stub = blockKey(flowId, 0);
		if (!this.blocks.has(stub)) {
			this.blocks.set(stub, { key: stub, id: flowId, index: 0, messages: [] });
		}
		this.flowLastStep.set(flowId, stub);
		return stub;
	}

	private consumeBullet(event: Extract<ScanEvent, { kind: 'bullet' }>): void {
		if (!this.currentFlowId) {
			throw new DiagramSyntaxError('Step declared before any flow', event.line);
		}

		if (this.baseIndent === -1) {
			this.baseIndent = event.indent;
		}

		if (event.indent > this.baseIndent) {
			if (event.comment !== undefined) {
				throw new DiagramSyntaxError('Comments are only allowed on top-level flow steps, not on their details', event.line);
			}
			if (!this.lastMessage) {
				throw new DiagramSyntaxError('Detail line has no parent step', event.line);
			}
			this.lastMessage.comments.push(event.text);
			return;
		}

		this.stepIndex += 1;
		const key = blockKey(this.currentFlowId, this.stepIndex);
		const message: Message = { text: event.text, comments: [] };
		const block: Block = { key, id: this.currentFlowId, index: this.stepIndex, messages: [message] };
		this.blocks.set(key, block);

		if (this.stepIndex === 0) {
			if (this.pendingEdge) {
				this.edges.push({ from: this.pendingEdge.from, to: key, label: this.pendingEdge.label });
				this.pendingEdge = null;
			} else if (event.comment !== undefined) {
				throw new DiagramSyntaxError('The first step of a flow has no preceding transition to comment on', event.line);
			}
		} else {
			this.edges.push({ from: this.lastStepKey!, to: key, label: event.comment });
		}

		this.lastStepKey = key;
		this.flowLastStep.set(this.currentFlowId, key);
		this.lastMessage = message;
	}
}

import * as dagre from 'dagre';
import { DiagramModel, PositionedDiagram, PositionedEdge, PositionedNode } from './model';

const LINE_HEIGHT = 18;
const HEADER_HEIGHT = 34;
const VERTICAL_PADDING = 18;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;
const CHAR_WIDTH = 7;
const HORIZONTAL_PADDING = 44;

function estimateSize(node: DiagramModel['nodes'][number]): { width: number; height: number } {
	const title = node.fields[0]?.title ?? node.id;
	const bodyFields = node.fields.slice(1);

	let lineCount = 0;
	const lineLengths: number[] = [title.length];

	for (const field of bodyFields) {
		lineCount += 1;
		lineLengths.push(field.title.length);
		for (const item of field.items) {
			lineCount += 1;
			lineLengths.push(item.length + 2);
		}
	}

	const maxLen = Math.max(...lineLengths, 10);
	const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, maxLen * CHAR_WIDTH + HORIZONTAL_PADDING));
	const height = HEADER_HEIGHT + VERTICAL_PADDING + Math.max(lineCount, 0) * LINE_HEIGHT + (lineCount === 0 ? 8 : 0);

	return { width, height };
}

export function layoutDiagram(model: DiagramModel): PositionedDiagram {
	const g = new dagre.graphlib.Graph();
	g.setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 90, marginx: 40, marginy: 40 });
	g.setDefaultEdgeLabel(() => ({}));

	const knownIds = new Set(model.nodes.map((n) => n.id));
	const sizes = new Map<string, { width: number; height: number }>();

	for (const node of model.nodes) {
		const size = estimateSize(node);
		sizes.set(node.id, size);
		g.setNode(node.id, size);
	}

	const validEdges = model.edges.filter((e) => knownIds.has(e.from) && knownIds.has(e.to));
	for (const edge of validEdges) {
		g.setEdge(edge.from, edge.to);
	}

	dagre.layout(g);

	const positionedNodes: PositionedNode[] = model.nodes.map((node) => {
		const gNode = g.node(node.id);
		const size = sizes.get(node.id)!;
		return {
			...node,
			x: gNode ? gNode.x - size.width / 2 : 0,
			y: gNode ? gNode.y - size.height / 2 : 0,
			width: size.width,
			height: size.height,
		};
	});

	const positionedEdges: PositionedEdge[] = validEdges.map((edge) => {
		const gEdge = g.edge(edge.from, edge.to);
		const points = gEdge?.points?.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })) ?? [];
		return { ...edge, points };
	});

	let maxX = 0;
	let maxY = 0;
	for (const n of positionedNodes) {
		maxX = Math.max(maxX, n.x + n.width);
		maxY = Math.max(maxY, n.y + n.height);
	}

	return {
		nodes: positionedNodes,
		edges: positionedEdges,
		width: maxX + 60,
		height: maxY + 60,
	};
}

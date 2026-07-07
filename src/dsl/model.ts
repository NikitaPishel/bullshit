export interface DiagramField {
	title: string;
	items: string[];
}

export interface DiagramNode {
	id: string;
	fields: DiagramField[];
}

export interface DiagramEdge {
	from: string;
	to: string;
	label?: string;
}

export interface DiagramModel {
	nodes: DiagramNode[];
	edges: DiagramEdge[];
}

export interface PositionedNode extends DiagramNode {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PositionedEdge extends DiagramEdge {
	points: { x: number; y: number }[];
}

export interface PositionedDiagram {
	nodes: PositionedNode[];
	edges: PositionedEdge[];
	width: number;
	height: number;
}

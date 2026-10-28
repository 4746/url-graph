import type { LayoutNode } from '../graph/layout-geometry';

export interface LayoutRequest {
	nodes: LayoutNode[];
	edges: Array<{ id: string; source: string; target: string }>;
	spacing: number;
	groupBySize?: boolean;
}
export interface LayoutResult {
	positions: Array<{ id: string; x: number; y: number }>;
}

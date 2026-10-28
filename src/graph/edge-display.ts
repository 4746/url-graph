import type { GraphEdge } from './types';

export interface DisplayEdge extends GraphEdge {
	sourceArrow: 'none' | 'triangle';
	targetArrow: 'none' | 'triangle';
}

export function displayEdges(edges: readonly GraphEdge[]): DisplayEdge[] {
	const pairs = new Map<string, DisplayEdge>();
	for (const edge of edges) {
		if (edge.source === edge.target) continue;
		const [source, target] = edge.source < edge.target ? [edge.source, edge.target] : [edge.target, edge.source];
		const id = JSON.stringify(['pair', source, target]);
		const pair = pairs.get(id) ?? { id, source, target, sourceArrow: 'none', targetArrow: 'none' };
		if (edge.source === source) pair.targetArrow = 'triangle';
		else pair.sourceArrow = 'triangle';
		pairs.set(id, pair);
	}
	return [...pairs.values()];
}

import type { GraphEdge, GraphNode } from './types';
import type { NodeSizeMode } from './options';

export interface NodeMetrics {
	nodeSize: number;
	incomingCount: number;
	outgoingCount: number;
}

export function nodeMetrics(nodes: readonly GraphNode[], edges: readonly GraphEdge[], mode: NodeSizeMode): Map<string, NodeMetrics> {
	const metrics = new Map(nodes.map((node) => [node.id, { nodeSize: 22, incomingCount: 0, outgoingCount: 0 }]));
	for (const edge of edges) {
		if (edge.source === edge.target) continue;
		const source = metrics.get(edge.source);
		const target = metrics.get(edge.target);
		if (source && target) { source.outgoingCount++; target.incomingCount++; }
	}
	if (mode === 'uniform') return metrics;
	const count = (metric: NodeMetrics) => mode === 'outgoing' ? metric.outgoingCount : metric.incomingCount;
	let min = Infinity;
	let max = 0;
	for (const metric of metrics.values()) {
		const value = count(metric);
		min = Math.min(min, value);
		max = Math.max(max, value);
	}
	// Use the visible range so close counts stay distinguishable and hubs never saturate early.
	if (max > min) {
		for (const metric of metrics.values()) {
			metric.nodeSize = 22 + 66 * (count(metric) - min) / (max - min);
		}
	}
	return metrics;
}

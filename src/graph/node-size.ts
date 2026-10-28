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
	for (const metric of metrics.values()) {
		const count = mode === 'outgoing' ? metric.outgoingCount : mode === 'incoming' ? metric.incomingCount : 0;
		metric.nodeSize = Math.min(64, 22 + 6 * Math.sqrt(count));
	}
	return metrics;
}

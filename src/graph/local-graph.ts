import type { GraphSnapshot } from './types';

/** Only direct relationships of the root, never neighbors-of-neighbors. */
export function localGraph(graph: GraphSnapshot, path: string | null): GraphSnapshot {
	const root = graph.nodes.find((node) => node.path === path);
	if (!root) return { nodes: [], edges: [], errors: graph.errors };
	const available = new Set(graph.nodes.map((node) => node.id));
	const edges = graph.edges.filter((edge) => edge.source !== edge.target
		&& available.has(edge.source) && available.has(edge.target)
		&& (edge.source === root.id || edge.target === root.id));
	const ids = new Set([root.id, ...edges.flatMap((edge) => [edge.source, edge.target])]);
	return { nodes: graph.nodes.filter((node) => ids.has(node.id)), edges, errors: graph.errors };
}

export function localRootPath(state: unknown): string | null {
	if (!state || typeof state !== 'object' || !Object.prototype.hasOwnProperty.call(state, 'rootPath')) return null;
	const path: unknown = (state as Record<string, unknown>).rootPath;
	return typeof path === 'string' && path.trim() ? path : null;
}

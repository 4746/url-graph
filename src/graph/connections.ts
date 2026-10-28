import type { GraphNode, GraphSnapshot } from './types';

export interface NoteConnections { note: GraphNode | null; outgoing: GraphNode[]; incoming: GraphNode[] }

export function noteConnections(graph: GraphSnapshot, path: string): NoteConnections {
	const note = graph.nodes.find((node) => node.path === path) ?? null;
	if (!note) return { note, outgoing: [], incoming: [] };
	const outgoing = new Set<string>();
	const incoming = new Set<string>();
	for (const edge of graph.edges) {
		if (edge.source === note.id && edge.target !== note.id) outgoing.add(edge.target);
		if (edge.target === note.id && edge.source !== note.id) incoming.add(edge.source);
	}
	const collect = (ids: Set<string>) => graph.nodes.filter((node) => ids.has(node.id))
		.sort((a, b) => a.label.localeCompare(b.label) || a.path.localeCompare(b.path));
	return { note, outgoing: collect(outgoing), incoming: collect(incoming) };
}

export class ConnectionSelection {
	path: string | null = null;
	private listeners = new Set<() => void>();
	select(path: string | null, refresh = false): void {
		if (this.path === path && !refresh) return;
		this.path = path;
		for (const listener of this.listeners) listener();
	}
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}
}

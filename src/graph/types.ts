export interface NoteRecord {
	path: string;
	label: string;
	url: string | null;
	links: string[];
	metadata?: Record<string, string[]>;
}
export interface GraphNode { id: string; path: string; label: string; url: string; metadata?: Record<string, string[]> }
export interface GraphEdge { id: string; source: string; target: string }
export interface GraphSnapshot { nodes: GraphNode[]; edges: GraphEdge[]; errors: number }

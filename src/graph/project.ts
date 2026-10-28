import type { GraphNode, GraphSnapshot } from './types';
import type { GraphOptions } from './options';
import { nodeMetrics, type NodeMetrics } from './node-size';
import { displayEdges, type DisplayEdge } from './edge-display';

export interface DisplayNode extends GraphNode, NodeMetrics { displayLabel: string; nodeColor: string }
export interface DisplayGraph extends Omit<GraphSnapshot, 'nodes' | 'edges'> {
	nodes: DisplayNode[];
	edges: DisplayEdge[];
	connectionCount: number;
}

const palette = ['#8b7cf8', '#e89b45', '#51b7a1', '#de7998', '#65a8e5', '#b59c45', '#b780c9', '#6aa96e'];

export function groupColor(group: string): string {
	let hash = 0;
	for (const char of group) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
	return palette[(hash >>> 0) % palette.length]!;
}

function inFolder(path: string, folder: string): boolean {
	return folder === '/' ? !path.includes('/') : path.startsWith(`${folder}/`);
}

function inDomain(host: string, domain: string): boolean {
	return host === domain || host.endsWith(`.${domain}`);
}

function hostname(url: string): string {
	try { return new URL(url).hostname.toLowerCase().replace(/\.$/, ''); }
	catch { return ''; }
}

export function projectGraph(graph: GraphSnapshot, options: GraphOptions): DisplayGraph {
	let nodes = graph.nodes.filter((node) => {
		const host = hostname(node.url);
		return (!options.includeFolders.length || options.includeFolders.some((folder) => inFolder(node.path, folder)))
			&& !options.excludeFolders.some((folder) => inFolder(node.path, folder))
			&& (!options.includeDomains.length || options.includeDomains.some((domain) => inDomain(host, domain)))
			&& !options.excludeDomains.some((domain) => inDomain(host, domain))
			&& options.metadataProperties.every((property) => {
				const selected = Object.prototype.hasOwnProperty.call(options.metadataFilters, property) ? options.metadataFilters[property] : '';
				return !selected || !!(node.metadata && Object.prototype.hasOwnProperty.call(node.metadata, property)
					&& node.metadata[property]?.includes(selected));
			});
	});
	const ids = new Set(nodes.map((node) => node.id));
	const edges = graph.edges.filter((edge) => edge.source !== edge.target && ids.has(edge.source) && ids.has(edge.target));
	if (!options.showIsolated) {
		const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
		nodes = nodes.filter((node) => connected.has(node.id));
	}
	const metrics = nodeMetrics(nodes, edges, options.nodeSizeMode);
	return { edges: displayEdges(edges), connectionCount: edges.length, errors: graph.errors, nodes: nodes.map((node) => ({
		...node,
		...metrics.get(node.id)!,
		displayLabel: options.nodeLabel === 'url' ? node.url : options.nodeLabel === 'path' ? node.path : node.label,
		nodeColor: options.colorMode === 'custom' ? options.nodeColor : groupColor(options.colorMode === 'domain'
			? hostname(node.url) : node.path.substring(0, node.path.lastIndexOf('/')) || '/'),
	})) };
}

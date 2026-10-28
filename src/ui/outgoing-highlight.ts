import type { NodeCollection } from 'cytoscape';

/** A merged edge can carry an outgoing direction at either endpoint. */
export function highlightOutgoing(node: NodeCollection, prefix: 'hover' | 'pinned'): void {
	if (node.empty()) return;
	const id = node[0]!.id();
	for (const edge of node.connectedEdges()) {
		if (edge.source().id() === id && edge.data('targetArrow') !== 'none') edge.addClass(`${prefix}-outgoing ${prefix}-forward`);
		if (edge.target().id() === id && edge.data('sourceArrow') === 'triangle') edge.addClass(`${prefix}-outgoing ${prefix}-reverse`);
	}
}

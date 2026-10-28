import type { Core } from 'cytoscape';
import { highlightOutgoing } from './outgoing-highlight';

export function pinConnections(cy: Core, path: string | null): void {
	cy.batch(() => {
		cy.elements('.pinned-connected, .pinned-outgoing, .pinned-root').removeClass('pinned-connected pinned-outgoing pinned-root pinned-forward pinned-reverse');
		if (!path) return;
		const node = cy.nodes().filter((candidate) => candidate.data('path') === path);
		if (node.empty()) return;
		node.addClass('pinned-root');
		node.closedNeighborhood().nodes().addClass('pinned-connected');
		highlightOutgoing(node, 'pinned');
	});
}

export function focusGraph(cy: Core, path: string, neighborhood: boolean): boolean {
	const node = cy.nodes().filter((candidate) => candidate.data('path') === path);
	if (node.empty()) return false;
	if (neighborhood) cy.fit(node.closedNeighborhood(), 60);
	else { cy.zoom(Math.min(cy.maxZoom(), Math.max(1, cy.zoom()))); cy.center(node); }
	return true;
}

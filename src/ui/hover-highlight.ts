import type { Core, EventObjectNode } from 'cytoscape';
import { highlightOutgoing } from './outgoing-highlight';

export function clearHoverHighlight(cy: Core): void {
	cy.batch(() => {
		cy.nodes('.hover-connected').removeClass('hover-connected');
		cy.nodes('.label-hover').removeClass('label-hover');
		cy.edges('.hover-outgoing').removeClass('hover-outgoing hover-forward hover-reverse');
	});
}

/** Highlight only the hovered note and its immediate neighbors in either direction. */
export function registerHoverHighlight(cy: Core): () => void {
	let hovered: string | undefined;
	const enter = (event: EventObjectNode) => {
		hovered = event.target.id();
		cy.batch(() => {
			clearHoverHighlight(cy);
			event.target.addClass('label-hover');
			event.target.closedNeighborhood().nodes().addClass('hover-connected');
			highlightOutgoing(event.target, 'hover');
		});
	};
	const leave = (event: EventObjectNode) => {
		if (hovered !== event.target.id()) return;
		hovered = undefined;
		clearHoverHighlight(cy);
	};
	cy.on('mouseover', 'node', enter);
	cy.on('mouseout', 'node', leave);
	return () => {
		cy.off('mouseover', 'node', enter);
		cy.off('mouseout', 'node', leave);
		if (!cy.destroyed()) clearHoverHighlight(cy);
	};
}

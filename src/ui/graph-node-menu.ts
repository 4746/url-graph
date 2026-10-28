import { Menu } from 'obsidian';
import type { Core, EventObjectNode } from 'cytoscape';
import type { I18n } from '../i18n';

export function registerNodeMenu(cy: Core, canvas: HTMLElement, i18n: I18n,
	showConnections: (path: string) => Promise<void>, openLocalGraph: (path: string) => Promise<void>): () => void {
	const show = (event: EventObjectNode) => {
		const path: unknown = event.target.data('path');
		if (typeof path !== 'string') return;
		const bounds = canvas.getBoundingClientRect();
		const menu = new Menu();
		menu.addItem((item) => item.setTitle(i18n.t('graph.openLocal')).setIcon('git-branch')
			.onClick(() => { void openLocalGraph(path); }));
		menu.addItem((item) => item.setTitle(i18n.t('connections.show')).setIcon('links-coming-in')
			.onClick(() => { void showConnections(path); }));
		menu.showAtPosition({ x: bounds.left + event.renderedPosition.x, y: bounds.top + event.renderedPosition.y }, canvas.ownerDocument);
	};
	cy.on('cxttap', 'node', show);
	return () => { cy.off('cxttap', 'node', show); };
}

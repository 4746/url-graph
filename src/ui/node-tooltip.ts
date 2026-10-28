import type { Core, EventObjectNode } from 'cytoscape';
import type { GraphPreferences } from '../graph/preferences';
import type { I18n } from '../i18n';

export function registerNodeTooltip(cy: Core, stage: HTMLElement, preferences: GraphPreferences, i18n: I18n): () => void {
	const tooltip = stage.ownerDocument.createElement('div');
	tooltip.className = 'url-graph-node-tooltip';
	tooltip.setAttribute('role', 'tooltip');
	const title = stage.ownerDocument.createElement('div');
	title.className = 'url-graph-node-tooltip-title';
	const counts = stage.ownerDocument.createElement('div');
	tooltip.append(title, counts);
	stage.append(tooltip);
	const hide = () => { tooltip.hidden = true; };
	hide();
	const show = (event: EventObjectNode) => {
		if (!preferences.get().showNodeTooltip || event.target.grabbed()) { hide(); return; }
		title.textContent = String(event.target.data('label') ?? event.target.data('displayLabel') ?? '');
		counts.textContent = i18n.t('graph.tooltipCounts', {
			incoming: Number(event.target.data('incomingCount')) || 0,
			outgoing: Number(event.target.data('outgoingCount')) || 0,
		});
		tooltip.hidden = false;
		const point = event.renderedPosition ?? event.target.renderedPosition();
		const x = Math.max(8, Math.min(point.x + 16, stage.clientWidth - tooltip.offsetWidth - 8));
		const y = Math.max(8, point.y + 20 + tooltip.offsetHeight > stage.clientHeight
			? point.y - tooltip.offsetHeight - 16 : point.y + 20);
		tooltip.style.setProperty('left', `${x}px`);
		tooltip.style.setProperty('top', `${y}px`);
	};
	cy.on('mouseover mousemove', 'node', show);
	cy.on('mouseout grab tapstart', 'node', hide);
	cy.on('pan zoom add remove data layoutstart', hide);
	stage.addEventListener('mouseleave', hide);
	const unsubscribePreferences = preferences.subscribe(hide);
	const unsubscribeLanguage = i18n.subscribe(hide);
	return () => {
		cy.off('mouseover mousemove', 'node', show);
		cy.off('mouseout grab tapstart', 'node', hide);
		cy.off('pan zoom add remove data layoutstart', hide);
		stage.removeEventListener('mouseleave', hide);
		unsubscribePreferences();
		unsubscribeLanguage();
		tooltip.remove();
	};
}

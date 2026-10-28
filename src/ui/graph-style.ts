import type { EdgeSingular, StylesheetStyle } from 'cytoscape';
import type { GraphOptions } from '../graph/options';

export function graphStyle(container: HTMLElement, options: GraphOptions): StylesheetStyle[] {
	const css = container.ownerDocument.defaultView!.getComputedStyle(container);
	const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
	return [
		{ selector: 'node', style: {
			label: options.labelVisibility === 'always' ? 'data(displayLabel)' : '',
			'background-color': options.colorMode === 'theme' ? color('--text-muted', '#999') : 'data(nodeColor)',
			color: color('--text-normal', '#888'), 'font-size': 12, width: 'data(nodeSize)', height: 'data(nodeSize)',
			'text-valign': 'bottom', 'text-margin-y': 7, 'text-max-width': '160px', 'text-wrap': 'ellipsis',
		} },
		{ selector: 'edge', style: {
			width: options.edgeWidth, 'curve-style': 'straight',
			'target-arrow-shape': (edge: EdgeSingular) => options.showArrows && edge.data('targetArrow') === 'triangle' ? 'triangle' : 'none',
			'source-arrow-shape': (edge: EdgeSingular) => options.showArrows && edge.data('sourceArrow') === 'triangle' ? 'triangle' : 'none',
			'line-color': color('--text-faint', '#999'), 'target-arrow-color': color('--text-faint', '#999'), 'source-arrow-color': color('--text-faint', '#999'),
			'arrow-scale': 0.9, opacity: options.edgeOpacity,
		} },
		{ selector: 'node.label-hover, node:selected, node.pinned-root', style: {
			label: options.labelVisibility === 'hidden' ? '' : 'data(displayLabel)',
		} },
		{ selector: 'node.hover-connected, node.pinned-connected', style: {
			'background-color': '#8b5cf6',
		} },
		{ selector: 'edge.hover-outgoing, edge.pinned-outgoing', style: {
			'line-color': '#8b5cf6', opacity: 1,
		} },
		{ selector: 'edge.hover-forward, edge.pinned-forward', style: { 'target-arrow-color': '#8b5cf6' } },
		{ selector: 'edge.hover-reverse, edge.pinned-reverse', style: { 'source-arrow-color': '#8b5cf6' } },
		{ selector: 'node.pinned-root', style: { 'border-width': 3, 'border-color': '#8b5cf6' } },
		{ selector: ':selected', style: {
			'border-width': 3, 'border-color': color('--text-normal', '#888'),
		} },
	];
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import cytoscape from 'cytoscape';
import { registerNodeTooltip } from '../src/ui/node-tooltip';
import { DEFAULT_GRAPH_OPTIONS, loadGraphOptions } from '../src/graph/options';
import { GraphPreferences } from '../src/graph/preferences';
import { I18n } from '../src/i18n';

class Element {
	children: Element[] = [];
	className = '';
	textContent = '';
	hidden = false;
	removed = false;
	clientWidth = 600;
	clientHeight = 400;
	offsetWidth = 160;
	offsetHeight = 60;
	style = { setProperty: () => {} };
	ownerDocument = { createElement: () => new Element() };
	setAttribute(): void {}
	append(...children: Element[]): void { this.children.push(...children); }
	remove(): void { this.removed = true; }
	addEventListener(): void {}
	removeEventListener(): void {}
}

void test('node tooltip shows safe localized counts and responds to preference changes and disposal', () => {
	const options = { ...DEFAULT_GRAPH_OPTIONS };
	const preferences = new GraphPreferences(() => options);
	const i18n = new I18n('en', () => 'en');
	const stage = new Element();
	const cy = cytoscape({ headless: true, layout: { name: 'preset' }, elements: [
		{ data: { id: 'a', label: '<img src=x>', incomingCount: 12, outgoingCount: 3 } },
	] });
	const dispose = registerNodeTooltip(cy, stage as unknown as HTMLElement, preferences, i18n);
	try {
		const tooltip = stage.children[0]!;
		const node = cy.getElementById('a');
		node.emit('mouseover');
		assert.equal(tooltip.hidden, false);
		assert.equal(tooltip.children[0]!.textContent, '<img src=x>');
		assert.equal(tooltip.children[1]!.textContent, 'Incoming: 12 / Outgoing: 3');
		cy.emit('zoom');
		assert.equal(tooltip.hidden, true);
		options.showNodeTooltip = false; preferences.notify();
		node.emit('mouseover');
		assert.equal(tooltip.hidden, true);
		options.showNodeTooltip = true; preferences.notify();
		i18n.setLanguage('uk'); node.emit('mouseover');
		assert.equal(tooltip.children[1]!.textContent, 'Вхідні: 12 / Вихідні: 3');
		node.emit('mouseout');
		assert.equal(tooltip.hidden, true);
		dispose();
		assert.equal(tooltip.removed, true);
		node.emit('mouseover');
		assert.equal(tooltip.hidden, true);
	} finally { dispose(); cy.destroy(); }
});

void test('tooltip and grouping preferences have enabled defaults and validate persisted booleans', () => {
	assert.equal(loadGraphOptions({}).groupBySize, true);
	assert.equal(loadGraphOptions({}).showNodeTooltip, true);
	const disabled = loadGraphOptions({ groupBySize: false, showNodeTooltip: false });
	assert.equal(disabled.groupBySize, false);
	assert.equal(disabled.showNodeTooltip, false);
	assert.equal(loadGraphOptions({ showNodeTooltip: 'false' }).showNodeTooltip, true);
});

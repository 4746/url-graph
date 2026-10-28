import assert from 'node:assert/strict';
import { test } from 'node:test';
import cytoscape from 'cytoscape';
import { buildGraph } from '../src/graph/build';
import { projectGraph } from '../src/graph/project';
import { DEFAULT_GRAPH_OPTIONS } from '../src/graph/options';
import { graphStyle } from '../src/ui/graph-style';
import { syncGraph } from '../src/ui/sync-graph';
import { registerHoverHighlight, clearHoverHighlight } from '../src/ui/hover-highlight';
import { pinConnections } from '../src/ui/graph-focus';

const note = (path: string, targets: string[] = []) => ({ path, label: path, url: `https://example.com/${path}`,
	links: targets.map((target) => `https://example.com/${target}`) });
const graph = buildGraph([note('a.md', ['b.md', 'c.md']), note('b.md', ['a.md']), note('c.md'), note('d.md', ['a.md'])]);
const container = { ownerDocument: { defaultView: { getComputedStyle: () => ({ getPropertyValue: () => '' }) } } } as unknown as HTMLElement;

void test('graph creates one pair line with correct direction flags and preserves logical counts and node sizes', () => {
	const merged = projectGraph(graph, { ...DEFAULT_GRAPH_OPTIONS, nodeSizeMode: 'outgoing' });
	assert.equal(merged.edges.length, 3);
	assert.equal(merged.connectionCount, 4);
	assert.ok(merged.nodes.find((node) => node.path === 'a.md')!.nodeSize > merged.nodes.find((node) => node.path === 'b.md')!.nodeSize);
	const id = (path: string) => graph.nodes.find((node) => node.path === path)!.id;
	const ab = merged.edges.find((edge) => edge.source === id('a.md') && edge.target === id('b.md'))!;
	assert.equal(ab.sourceArrow, 'triangle'); assert.equal(ab.targetArrow, 'triangle');
	const ac = merged.edges.find((edge) => edge.target === id('c.md'))!;
	assert.equal(ac.sourceArrow, 'none'); assert.equal(ac.targetArrow, 'triangle');
	const da = merged.edges.find((edge) => edge.target === id('d.md'))!;
	assert.equal(da.sourceArrow, 'triangle'); assert.equal(da.targetArrow, 'none');
	assert.equal(graph.edges.length, 4);
});

void test('merged lines and outgoing hover/pin arrowheads work from either endpoint', () => {
	const options = { ...DEFAULT_GRAPH_OPTIONS };
	const display = projectGraph(graph, options);
	const cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: 'preset' }, style: graphStyle(container, options) });
	const dispose = registerHoverHighlight(cy);
	try {
		syncGraph(cy, display);
		const a = cy.nodes().filter((node) => node.data('path') === 'a.md');
		const b = cy.nodes().filter((node) => node.data('path') === 'b.md');
		const pair = cy.edges().filter((edge) => edge.source().id() === a[0]!.id() && edge.target().id() === b[0]!.id());
		assert.equal(pair.style('curve-style'), 'straight');
		assert.equal(pair.style('source-arrow-shape'), 'triangle');
		assert.equal(pair.style('target-arrow-shape'), 'triangle');
		const edgeIds = cy.edges().map((edge) => edge.id());
		cy.style(graphStyle(container, { ...options, showArrows: false }));
		assert.ok(cy.edges().every((edge) => edge.style('source-arrow-shape') === 'none' && edge.style('target-arrow-shape') === 'none'));
		assert.deepEqual(cy.edges().map((edge) => edge.id()), edgeIds);
		b.emit('mouseover');
		assert.equal(cy.edges('.hover-outgoing').length, 1);
		clearHoverHighlight(cy);
		cy.style(graphStyle(container, options));
		assert.equal(pair.style('source-arrow-shape'), 'triangle');
		assert.equal(pair.style('target-arrow-shape'), 'triangle');
		b.emit('mouseover');
		assert.equal(cy.edges('.hover-outgoing').length, 1);
		assert.equal(pair.style('source-arrow-color'), 'rgb(139,92,246)');
		assert.equal(pair.style('target-arrow-color'), 'rgb(153,153,153)');
		clearHoverHighlight(cy);
		a.emit('mouseover');
		assert.equal(cy.edges('.hover-outgoing').length, 2);
		assert.equal(pair.style('target-arrow-color'), 'rgb(139,92,246)');
		assert.equal(pair.style('source-arrow-color'), 'rgb(153,153,153)');
		clearHoverHighlight(cy);
		pinConnections(cy, 'b.md');
		assert.equal(cy.edges('.pinned-outgoing').length, 1);
		assert.equal(pair.style('source-arrow-color'), 'rgb(139,92,246)');
	} finally { dispose(); cy.destroy(); }
});

void test('existing pair edge updates arrowheads when index directions change without changing its identity', () => {
	const original = buildGraph([note('a.md', ['b.md']), note('b.md')]);
	const updated = buildGraph([note('a.md', ['b.md']), note('b.md', ['a.md'])]);
	const options = { ...DEFAULT_GRAPH_OPTIONS };
	const cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: 'preset' }, style: graphStyle(container, options) });
	try {
		syncGraph(cy, projectGraph(original, options));
		const edge = cy.edges()[0]!;
		assert.equal(edge.style('source-arrow-shape'), 'none');
		assert.equal(syncGraph(cy, projectGraph(updated, options)), false);
		assert.equal(edge.style('source-arrow-shape'), 'triangle');
		assert.equal(cy.edges().length, 1);
	} finally { cy.destroy(); }
});

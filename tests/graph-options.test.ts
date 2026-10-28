import assert from 'node:assert/strict';
import { test } from 'node:test';
import cytoscape from 'cytoscape';
import { buildGraph } from '../src/graph/build';
import { DEFAULT_GRAPH_OPTIONS, loadGraphOptions, normalizeDomain, normalizeFolder } from '../src/graph/options';
import { projectGraph } from '../src/graph/project';
import { loadSettings } from '../src/settings-data';
import { graphStyle } from '../src/ui/graph-style';
import { syncGraph } from '../src/ui/sync-graph';
import { GraphPreferences } from '../src/graph/preferences';
import { clearHoverHighlight, registerHoverHighlight } from '../src/ui/hover-highlight';

const records = [
	{ path: 'blog/a.md', label: 'a', url: 'https://example.com/a', links: ['https://sub.example.com/b'] },
	{ path: 'blog/sub/b.md', label: 'b', url: 'https://sub.example.com/b', links: [] },
	{ path: 'blogger/c.md', label: 'c', url: 'https://notexample.com/c', links: [] },
	{ path: 'root.md', label: 'root', url: 'https://example.com/root', links: [] },
];
const graph = buildGraph(records);

void test('options migrate existing data and validate booleans, ranges, enums, filters and colors', () => {
	assert.deepEqual(loadGraphOptions({}), DEFAULT_GRAPH_OPTIONS);
	const options = loadGraphOptions({ showIsolated: 'false', nodeSpacing: 1,
		edgeWidth: 100, edgeOpacity: NaN, labelVisibility: 'invalid', nodeColor: 'red',
		includeFolders: ['blog/', 'blog', '../private', 5], includeDomains: ['EXAMPLE.COM', 'example.com', '*.bad.test'] });
	assert.equal(options.showIsolated, true);
	assert.equal(options.showArrows, true);
	assert.equal(loadGraphOptions({ showArrows: false }).showArrows, false);
	assert.equal(options.nodeSpacing, 40);
	assert.equal(options.edgeWidth, 5);
	assert.equal(options.edgeOpacity, 0.7);
	assert.equal(options.labelVisibility, 'always');
	assert.equal(options.nodeColor, '#7c6ee6');
	assert.deepEqual(options.includeFolders, ['blog']);
	assert.deepEqual(options.includeDomains, ['example.com']);
	assert.equal(loadSettings({ nodeColor: '#AABBCC', edgeOpacity: -1 }).edgeOpacity, 0.1);
	assert.equal(normalizeDomain('https://EXAMPLE.com:443/'), 'example.com');
	assert.equal(normalizeDomain('example.com/page'), null);
	assert.equal(normalizeFolder(' blog\\sub/ '), 'blog/sub');
});

void test('folder filters include descendants, respect path boundaries, prioritize excludes and support root', () => {
	const options = { ...DEFAULT_GRAPH_OPTIONS, includeFolders: ['blog'] };
	assert.deepEqual(projectGraph(graph, options).nodes.map((node) => node.path), ['blog/a.md', 'blog/sub/b.md']);
	const filtered = projectGraph(graph, { ...options, excludeFolders: ['blog/sub'] });
	assert.deepEqual(filtered.nodes.map((node) => node.path), ['blog/a.md']);
	assert.deepEqual(filtered.edges, []);
	assert.deepEqual(projectGraph(graph, { ...options, includeFolders: ['/'] }).nodes.map((node) => node.path), ['root.md']);
});

void test('domain filters include subdomains and exclude lookalike suffixes; folder and domain filters intersect', () => {
	const options = { ...DEFAULT_GRAPH_OPTIONS, includeDomains: ['example.com'] };
	assert.equal(projectGraph(graph, options).nodes.length, 3);
	const filtered = projectGraph(graph, { ...options, excludeDomains: ['sub.example.com'], includeFolders: ['blog'] });
	assert.deepEqual(filtered.nodes.map((node) => node.path), ['blog/a.md']);
	assert.deepEqual(filtered.edges, []);
	assert.equal(projectGraph(graph, { ...options, excludeDomains: ['example.com'] }).nodes.length, 0);
});

void test('isolated notes are removed after filters, considering both incoming and outgoing edges', () => {
	const visible = projectGraph(graph, { ...DEFAULT_GRAPH_OPTIONS, showIsolated: false });
	assert.deepEqual(visible.nodes.map((node) => node.path), ['blog/a.md', 'blog/sub/b.md']);
	assert.equal(visible.edges.length, 1);
	const excluded = projectGraph(graph, { ...DEFAULT_GRAPH_OPTIONS, showIsolated: false, excludeFolders: ['blog/sub'] });
	assert.equal(excluded.nodes.length, 0);
	assert.equal(excluded.edges.length, 0);
	assert.equal(graph.nodes.length, 4);
	assert.equal(graph.edges.length, 1);
});

void test('display names and stable group colors do not affect URL matching', () => {
	assert.equal(projectGraph(graph, { ...DEFAULT_GRAPH_OPTIONS, nodeLabel: 'path' }).nodes[0]!.displayLabel, 'blog/a.md');
	assert.equal(projectGraph(graph, { ...DEFAULT_GRAPH_OPTIONS, nodeLabel: 'url' }).nodes[0]!.displayLabel, 'https://example.com/a');
	const custom = projectGraph(graph, { ...DEFAULT_GRAPH_OPTIONS, colorMode: 'custom', nodeColor: '#123456' });
	assert.ok(custom.nodes.every((node) => node.nodeColor === '#123456'));
	const sameFolder = buildGraph([...records, { path: 'blog/another.md', label: 'another', url: 'https://example.com/another', links: [] }]);
	for (const mode of ['domain', 'folder'] as const) {
		const visible = projectGraph(sameFolder, { ...DEFAULT_GRAPH_OPTIONS, colorMode: mode });
		assert.equal(visible.nodes[0]!.nodeColor, visible.nodes[4]!.nodeColor);
		assert.deepEqual(visible.edges, projectGraph(graph, DEFAULT_GRAPH_OPTIONS).edges);
	}
});

void test('synchronization preserves positions, selection and viewport on appearance changes and removes dangling edges', () => {
	const cy = cytoscape({ headless: true, layout: { name: 'preset' } });
	try {
		assert.equal(syncGraph(cy, projectGraph(graph, DEFAULT_GRAPH_OPTIONS)), true);
		const node = cy.getElementById(graph.nodes[0]!.id);
		node.position({ x: 200, y: 300 }).select();
		cy.zoom(2); cy.pan({ x: 40, y: 60 });
		assert.equal(syncGraph(cy, projectGraph(graph, { ...DEFAULT_GRAPH_OPTIONS, nodeLabel: 'url' })), false);
		assert.deepEqual(node.position(), { x: 200, y: 300 });
		assert.equal(node.selected(), true);
		assert.equal(cy.zoom(), 2);
		assert.deepEqual(cy.pan(), { x: 40, y: 60 });
		assert.equal(syncGraph(cy, projectGraph(graph, { ...DEFAULT_GRAPH_OPTIONS, excludeFolders: ['blog/sub'] })), true);
		assert.equal(cy.edges().length, 0);
		assert.equal(cy.nodes().length, 3);
	} finally { cy.destroy(); }
});

void test('Cytoscape styles apply arrows, width, opacity, custom colors and hover labels', () => {
	const container = { ownerDocument: { defaultView: { getComputedStyle: () => ({ getPropertyValue: () => '' }) } } } as unknown as HTMLElement;
	const options = { ...DEFAULT_GRAPH_OPTIONS, labelVisibility: 'hover' as const,
		colorMode: 'custom' as const, nodeColor: '#123456', edgeWidth: 3, edgeOpacity: 0.3 };
	const cy = cytoscape({ headless: true, styleEnabled: true, style: graphStyle(container, options), layout: { name: 'preset' } });
	try {
		syncGraph(cy, projectGraph(graph, options));
		const node = cy.nodes()[0]!;
		const edge = cy.edges()[0]!;
		assert.equal(edge.style('target-arrow-shape'), 'triangle');
		assert.equal(parseFloat(edge.style('width') as string), 3);
		assert.equal(parseFloat(edge.style('opacity') as string), 0.3);
		assert.equal(node.style('label'), '');
		node.addClass('label-hover');
		assert.equal(node.style('label'), 'a');
		assert.equal(node.style('background-color'), 'rgb(18,52,86)');
		cy.style(graphStyle(container, { ...options, labelVisibility: 'hidden' }));
		assert.equal(node.style('label'), '');
		assert.equal(edge.style('target-arrow-shape'), 'triangle');
	} finally { cy.destroy(); }
});

void test('graph preference subscriptions can be disposed', () => {
	const preferences = new GraphPreferences(() => DEFAULT_GRAPH_OPTIONS);
	let calls = 0;
	const dispose = preferences.subscribe(() => { calls++; });
	preferences.notify(); dispose(); preferences.notify();
	assert.equal(calls, 1);
});

void test('hover highlights only the node and incoming/outgoing neighbors, restoring neutral colors on leave', () => {
	const container = { ownerDocument: { defaultView: { getComputedStyle: () => ({ getPropertyValue: () => '' }) } } } as unknown as HTMLElement;
	const cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: 'preset' },
		style: graphStyle(container, DEFAULT_GRAPH_OPTIONS),
		elements: [
			...['a', 'b', 'c', 'd', 'isolated'].map((id) => ({ data: { id, displayLabel: id, nodeSize: 22 } })),
			{ data: { id: 'ab', source: 'a', target: 'b', sourceArrow: 'none', targetArrow: 'triangle' } },
			{ data: { id: 'ca', source: 'c', target: 'a', sourceArrow: 'none', targetArrow: 'triangle' } },
			{ data: { id: 'bd', source: 'b', target: 'd', sourceArrow: 'none', targetArrow: 'triangle' } },
		],
	});
	const dispose = registerHoverHighlight(cy);
	try {
		const a = cy.getElementById('a');
		assert.equal(a.style('background-color'), 'rgb(153,153,153)');
		a.emit('mouseover');
		assert.deepEqual(cy.nodes('.hover-connected').map((node) => node.id()).sort(), ['a', 'b', 'c']);
		assert.equal(a.style('background-color'), 'rgb(139,92,246)');
		assert.equal(cy.getElementById('b').style('background-color'), 'rgb(139,92,246)');
		assert.equal(cy.getElementById('d').style('background-color'), 'rgb(153,153,153)');
		assert.equal(a.hasClass('label-hover'), true);
		assert.deepEqual(cy.edges('.hover-outgoing').map((edge) => edge.id()), ['ab']);
		assert.equal(cy.getElementById('ab').style('line-color'), 'rgb(139,92,246)');
		assert.equal(cy.getElementById('ab').style('target-arrow-color'), 'rgb(139,92,246)');
		assert.equal(cy.getElementById('ca').style('line-color'), 'rgb(153,153,153)');
		a.emit('mouseout');
		assert.equal(cy.nodes('.hover-connected').length, 0);
		assert.equal(cy.edges('.hover-outgoing').length, 0);
		assert.equal(cy.getElementById('ab').style('line-color'), 'rgb(153,153,153)');
		assert.equal(parseFloat(cy.getElementById('ab').style('opacity') as string), DEFAULT_GRAPH_OPTIONS.edgeOpacity);
		assert.equal(a.style('background-color'), 'rgb(153,153,153)');
		cy.getElementById('isolated').emit('mouseover');
		assert.equal(cy.nodes('.hover-connected').length, 1);
		clearHoverHighlight(cy);
		assert.equal(cy.nodes('.hover-connected').length, 0);
		dispose();
		a.emit('mouseover');
		assert.equal(cy.nodes('.hover-connected').length, 0);
	} finally { dispose(); cy.destroy(); }
});

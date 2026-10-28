import assert from 'node:assert/strict';
import { test } from 'node:test';
import cytoscape from 'cytoscape';
import { buildGraph } from '../src/graph/build';
import { noteConnections, ConnectionSelection } from '../src/graph/connections';
import { projectGraph } from '../src/graph/project';
import { DEFAULT_GRAPH_OPTIONS } from '../src/graph/options';
import { focusGraph, pinConnections } from '../src/ui/graph-focus';
import { clearHoverHighlight } from '../src/ui/hover-highlight';

const graph = buildGraph([
	{ path: 'a.md', label: 'A', url: 'https://example.com/a', links: ['https://example.com/b', 'https://example.com/b'] },
	{ path: 'folder/b.md', label: 'B', url: 'https://example.com/b', links: [] },
	{ path: 'c.md', label: 'C', url: 'https://example.com/c', links: ['https://example.com/a'] },
	{ path: 'isolated.md', label: 'Isolated', url: 'https://example.com/i', links: [] },
]);

void test('connections are directed, deduplicated, and independent of visual filters', () => {
	const connections = noteConnections(graph, 'a.md');
	assert.equal(connections.note?.path, 'a.md');
	assert.deepEqual(connections.outgoing.map((node) => node.path), ['folder/b.md']);
	assert.deepEqual(connections.incoming.map((node) => node.path), ['c.md']);
	const visible = projectGraph(graph, { ...DEFAULT_GRAPH_OPTIONS, excludeFolders: ['folder'] });
	assert.equal(visible.nodes.some((node) => node.path === 'folder/b.md'), false);
	assert.equal(noteConnections(graph, 'a.md').outgoing.length, 1);
	assert.deepEqual(noteConnections(graph, 'unknown.md'), { note: null, outgoing: [], incoming: [] });
	assert.equal(noteConnections(graph, 'isolated.md').outgoing.length, 0);
});

void test('selection tracks changing notes and subscriptions can be removed', () => {
	const selection = new ConnectionSelection();
	const paths: Array<string | null> = [];
	const dispose = selection.subscribe(() => paths.push(selection.path));
	selection.select('a.md'); selection.select('a.md'); selection.select('folder/b.md');
	assert.deepEqual(paths, ['a.md', 'folder/b.md']);
	dispose(); selection.select(null);
	assert.equal(paths.length, 2);
});

void test('pinned highlights survive hover clearing and can switch notes or be removed', () => {
	const cy = cytoscape({ headless: true, layout: { name: 'preset' },
		elements: [...graph.nodes, ...graph.edges].map((data) => ({ data: { ...data } })) });
	try {
		pinConnections(cy, 'a.md');
		assert.deepEqual(cy.nodes('.pinned-connected').map((node) => node.data('path') as string).sort(), ['a.md', 'c.md', 'folder/b.md']);
		assert.equal(cy.edges('.pinned-outgoing').length, 1);
		clearHoverHighlight(cy);
		assert.equal(cy.nodes('.pinned-root').length, 1);
		pinConnections(cy, 'isolated.md');
		assert.equal(cy.nodes('.pinned-connected').length, 1);
		assert.equal(cy.edges('.pinned-outgoing').length, 0);
		pinConnections(cy, null);
		assert.equal(cy.nodes('.pinned-connected').length, 0);
	} finally { cy.destroy(); }
});

void test('graph focus respects visible nodes, centers targets and fits a direct neighborhood', () => {
	const cy = cytoscape({ headless: true, layout: { name: 'preset' },
		elements: [...graph.nodes, ...graph.edges].map((data) => ({ data: { ...data } })) });
	try {
		cy.nodes().positions((node, i) => ({ x: i * 300, y: i * 100 }));
		assert.equal(focusGraph(cy, 'a.md', false), true);
		assert.ok(cy.zoom() >= 1);
		assert.equal(focusGraph(cy, 'a.md', true), true);
		assert.equal(focusGraph(cy, 'hidden.md', false), false);
	} finally { cy.destroy(); }
});

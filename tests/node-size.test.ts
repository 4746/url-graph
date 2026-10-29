import assert from 'node:assert/strict';
import { test } from 'node:test';
import cytoscape from 'cytoscape';
import { setTimeout as delay } from 'node:timers/promises';
import { buildGraph } from '../src/graph/build';
import { projectGraph } from '../src/graph/project';
import { DEFAULT_GRAPH_OPTIONS, loadGraphOptions } from '../src/graph/options';
import { graphStyle } from '../src/ui/graph-style';
import { syncGraph } from '../src/ui/sync-graph';
import { createLayoutRequest } from '../src/ui/layout-request';
import { GraphRenderer } from '../src/ui/graph-renderer';
import { GraphPreferences } from '../src/graph/preferences';

const note = (path: string, links: string[] = []) => ({ path, label: path, url: `https://example.com/${path}`, links: links.map((link) => `https://example.com/${link}`) });
const graph = buildGraph([
	note('a.md', ['targets/b.md', 'targets/b.md', 'targets/c.md']), note('targets/b.md', ['targets/c.md']),
	note('targets/c.md'), note('d.md', ['a.md']), note('isolated.md'),
]);

void test('default node sizes are uniform and unknown modes fall back to uniform', () => {
	assert.equal(loadGraphOptions({}).nodeSizeMode, 'uniform');
	assert.equal(loadGraphOptions({ nodeSizeMode: 'unknown' }).nodeSizeMode, 'uniform');
	assert.ok(projectGraph(graph, DEFAULT_GRAPH_OPTIONS).nodes.every((node) => node.nodeSize === 22));
});

void test('relative sizing makes a narrow range visible and keeps large hubs distinct above the old cap', () => {
	const targets = Array.from({ length: 100 }, (_, index) => `${index}.md`);
	const source = buildGraph([note('small.md', targets.slice(0, 80)), note('medium.md', targets.slice(0, 90)),
		note('large.md', targets), ...targets.map((path) => note(path))]);
	const sizes = projectGraph(source, { ...DEFAULT_GRAPH_OPTIONS, nodeSizeMode: 'outgoing' });
	const size = (path: string) => sizes.nodes.find((node) => node.path === path)!.nodeSize;
	assert.equal(size('large.md'), 88);
	assert.ok(size('large.md') - size('medium.md') > 6);
	assert.ok(size('medium.md') - size('small.md') > 6);
	const narrowGraph = buildGraph(Array.from({ length: 14 }, (_, index) => note(`${index}.md`,
		Array.from({ length: index === 0 ? 12 : index === 1 ? 11 : 10 }, (_, offset) => `${(index + offset + 1) % 14}.md`))));
	const narrow = projectGraph(narrowGraph, { ...DEFAULT_GRAPH_OPTIONS, nodeSizeMode: 'outgoing' });
	assert.equal(narrow.nodes.find((node) => node.path === '0.md')!.nodeSize, 88);
	assert.equal(narrow.nodes.find((node) => node.path === '1.md')!.nodeSize, 55);
	assert.equal(narrow.nodes.find((node) => node.path === '2.md')!.nodeSize, 22);
});

void test('node sizes follow directed incoming or outgoing counts without duplicate Markdown links', () => {
	const outgoing = projectGraph(graph, { ...DEFAULT_GRAPH_OPTIONS, nodeSizeMode: 'outgoing' });
	const incoming = projectGraph(graph, { ...DEFAULT_GRAPH_OPTIONS, nodeSizeMode: 'incoming' });
	const a = outgoing.nodes.find((node) => node.path === 'a.md')!;
	const b = outgoing.nodes.find((node) => node.path === 'targets/b.md')!;
	const c = incoming.nodes.find((node) => node.path === 'targets/c.md')!;
	assert.equal(a.outgoingCount, 2);
	assert.equal(a.incomingCount, 1);
	assert.ok(a.nodeSize > b.nodeSize);
	assert.equal(c.incomingCount, 2);
	assert.ok(c.nodeSize > incoming.nodes.find((node) => node.path === 'a.md')!.nodeSize);
	assert.equal(outgoing.nodes.find((node) => node.path === 'isolated.md')!.nodeSize, 22);
});

void test('degree-based sizing reflects the currently visible filtered graph', () => {
	const filtered = projectGraph(graph, { ...DEFAULT_GRAPH_OPTIONS, nodeSizeMode: 'outgoing', includeFolders: ['/'] });
	assert.equal(filtered.nodes.find((node) => node.path === 'a.md')!.nodeSize, 22);
	assert.equal(filtered.nodes.find((node) => node.path === 'a.md')!.outgoingCount, 0);
	assert.ok(filtered.nodes.find((node) => node.path === 'd.md')!.nodeSize > 22);
});

void test('large hubs are bounded while rendering and collision footprints use actual circle diameters', () => {
	const targets = Array.from({ length: 100 }, (_, i) => `${i}.md`);
	const star = buildGraph([note('hub.md', targets), ...targets.map((path) => note(path, ['sink.md'])), note('sink.md')]);
	const outgoing = projectGraph(star, { ...DEFAULT_GRAPH_OPTIONS, nodeSizeMode: 'outgoing' });
	const incoming = projectGraph(star, { ...DEFAULT_GRAPH_OPTIONS, nodeSizeMode: 'incoming' });
	assert.equal(outgoing.nodes.find((node) => node.path === 'hub.md')!.nodeSize, 88);
	assert.equal(incoming.nodes.find((node) => node.path === 'sink.md')!.nodeSize, 88);
	const container = { ownerDocument: { defaultView: { getComputedStyle: () => ({ getPropertyValue: () => '' }) } } } as unknown as HTMLElement;
	const cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: 'preset' }, style: graphStyle(container, DEFAULT_GRAPH_OPTIONS) });
	try {
		syncGraph(cy, outgoing);
		const hub = cy.getElementById(outgoing.nodes.find((node) => node.path === 'hub.md')!.id);
		assert.equal(parseFloat(hub.style('width') as string), 88);
		assert.equal(parseFloat(hub.style('height') as string), 88);
		const footprint = createLayoutRequest(cy, 110, false).nodes.find((node) => node.id === hub.id())!;
		assert.ok(footprint.width! >= 88 && footprint.height! >= 88);
	} finally { cy.destroy(); }
});

void test('switching size mode recalculates layout even when graph topology and labels stay the same', async () => {
	const options = { ...DEFAULT_GRAPH_OPTIONS };
	const container = { ownerDocument: { defaultView: { getComputedStyle: () => ({ getPropertyValue: () => '' }) } } } as unknown as HTMLElement;
	const cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: 'preset' } });
	let runs = 0;
	let busy = false;
	const renderer = new GraphRenderer(cy, container, new GraphPreferences(() => options),
		(phase) => { busy = phase !== null; }, () => {}, () => assert.fail('Unexpected render failure'),
		{ run: () => { runs++; return Promise.resolve(true); }, cancel: () => {} });
	const until = async (count: number) => {
		const deadline = Date.now() + 3000;
		while (runs < count || busy) { assert.ok(Date.now() < deadline); await delay(5); }
	};
	try {
		renderer.request(graph);
		await until(1);
		options.nodeSizeMode = 'outgoing';
		renderer.request(graph);
		await until(2);
		assert.equal(runs, 2);
		const a = cy.nodes().filter((node) => node.data('path') === 'a.md');
		assert.ok(parseFloat(a.style('width') as string) > 22);
	} finally { renderer.dispose(); cy.destroy(); }
});

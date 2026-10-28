import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGraph } from '../src/graph/build';
import { localGraph, localRootPath } from '../src/graph/local-graph';
import { projectGraph } from '../src/graph/project';
import { DEFAULT_GRAPH_OPTIONS } from '../src/graph/options';
import { LocalGraphView, URL_LOCAL_GRAPH_VIEW } from '../src/ui/local-graph-view';
import { URL_GRAPH_VIEW } from '../src/ui/graph-view';
import type { UrlIndexer } from '../src/indexing/indexer';
import type { WorkspaceLeaf } from 'obsidian';
import type { ConnectionsController } from '../src/ui/connections-controller';
import { I18n } from '../src/i18n';
import { GraphPreferences } from '../src/graph/preferences';

const note = (path: string, targets: string[] = []) => ({ path, label: path, url: `https://example.com/${path}`,
	links: targets.map((target) => `https://example.com/${target}`) });
const graph = buildGraph([note('a.md', ['b.md']), note('b.md', ['c.md']), note('c.md', ['a.md']), note('d.md', ['b.md']), note('isolated.md')]);

void test('local graph contains root and direct incoming/outgoing edges without second-degree connections', () => {
	const local = localGraph(graph, 'a.md');
	assert.deepEqual(local.nodes.map((node) => node.path), ['a.md', 'b.md', 'c.md']);
	assert.equal(local.edges.length, 2);
	const root = local.nodes.find((node) => node.path === 'a.md')!;
	assert.ok(local.edges.every((edge) => edge.source === root.id || edge.target === root.id));
	assert.equal(graph.nodes.length, 5);
	assert.equal(graph.edges.length, 4);
});

void test('local scopes retain isolated roots and respect existing visual filters', () => {
	assert.equal(localGraph(graph, 'isolated.md').nodes.length, 1);
	assert.equal(localGraph(graph, 'isolated.md').edges.length, 0);
	assert.equal(localGraph(graph, 'missing.md').nodes.length, 0);
	assert.equal(localGraph(graph, null).nodes.length, 0);
	const local = localGraph(graph, 'a.md');
	const filtered = projectGraph(local, { ...DEFAULT_GRAPH_OPTIONS, includeDomains: ['other.test'] });
	assert.equal(filtered.nodes.length, 0);
	assert.equal(filtered.edges.length, 0);
	assert.equal(local.nodes.length, 3);
});

void test('workspace state accepts only an explicit nonempty root path', () => {
	assert.equal(localRootPath({ rootPath: 'folder/a.md' }), 'folder/a.md');
	for (const state of [null, {}, { rootPath: 2 }, { rootPath: '' }, { rootPath: ' ' }]) assert.equal(localRootPath(state), null);
	assert.equal(localRootPath(Object.create({ rootPath: 'inherited.md' })), null);
});

void test('local view roots persist independently across tabs and use a separate view type', async () => {
	const indexer = { ready: false, snapshot: graph } as unknown as UrlIndexer;
	const create = () => new LocalGraphView({} as WorkspaceLeaf, indexer, new I18n('en', () => 'en'),
		new GraphPreferences(() => DEFAULT_GRAPH_OPTIONS), () => {}, {} as ConnectionsController, () => {});
	const first = create();
	const second = create();
	await first.setState({ rootPath: 'a.md' }, { history: false });
	await second.setState({ rootPath: 'b.md' }, { history: false });
	assert.notEqual(URL_LOCAL_GRAPH_VIEW, URL_GRAPH_VIEW);
	assert.equal(first.getViewType(), URL_LOCAL_GRAPH_VIEW);
	assert.deepEqual(first.getState(), { rootPath: 'a.md' });
	assert.deepEqual(second.getState(), { rootPath: 'b.md' });
	assert.equal(first.getDisplayText(), 'URL graph: a');
	const restored = create();
	await restored.setState(first.getState(), { history: false });
	assert.deepEqual(restored.getState(), first.getState());
});

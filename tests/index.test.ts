import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { App } from 'obsidian';
import cytoscape from 'cytoscape';
import { normalizeUrl } from '../src/graph/url';
import { extractLinks } from '../src/graph/links';
import { buildGraph } from '../src/graph/build';
import { readNote } from '../src/indexing/read-note';
import { UrlIndexer } from '../src/indexing/indexer';
import { TFile } from './obsidian';
import { availableMetadataValues } from '../src/graph/metadata';
import './i18n.test';
import './graph-options.test';
import './responsiveness.test';
import './metadata-filter.test';
import './layout-geometry.test';
import './connections.test';
import './connections-controller.test';
import './node-size.test';
import './local-graph.test';
import './edge-display.test';
import './node-tooltip.test';

globalThis.window = globalThis as unknown as Window & typeof globalThis;

const note = (path: string, url: string, links = '') => readNote(path, path, `---\nurl: "${url}"\n---\n${links}`, 'url');

void test('URL normalization ignores fragments/slashes and normalizes host/default port', () => {
	assert.equal(normalizeUrl(' HTTPS://EXAMPLE.COM:443/a///#section '), 'https://example.com/a');
	assert.equal(normalizeUrl('https://example.com#top'), 'https://example.com/');
	assert.notEqual(normalizeUrl('http://example.com/a'), normalizeUrl('https://example.com/a'));
	assert.notEqual(normalizeUrl('https://example.com/A'), normalizeUrl('https://example.com/a'));
	assert.notEqual(normalizeUrl('https://example.com/a?q=1'), normalizeUrl('https://example.com/a?q=2'));
	for (const value of [null, [], 123, {}, '', '/relative', 'mailto:a@b.com', 'javascript:alert(1)', 'https://']) {
		assert.equal(normalizeUrl(value), null);
	}
});

void test('extract inline, reference, angle autolinks, bare URLs and balanced parentheses', () => {
	assert.deepEqual(extractLinks('[One](https://example.com/a/#x) [Two][ref]\n\n[ref]: https://example.com/b "Title"\n\n<https://example.com/c> https://example.com/d\n\n[Paren](https://example.com/a_(b))'), [
		'https://example.com/a', 'https://example.com/b', 'https://example.com/c', 'https://example.com/d', 'https://example.com/a_(b)',
	]);
});

void test('exclude images, code, comments and non-HTTP links', () => {
	assert.deepEqual(extractLinks('![alt [hidden](https://example.com/hidden)](https://example.com/image)'), []);
	assert.deepEqual(extractLinks('![image](https://example.com/image) `https://example.com/inline`\n\n```md\n[Code](https://example.com/code)\n```\n\n<!-- [hidden](https://example.com/html) -->\n%% [hidden](https://example.com/comment) %%\n[local](file.md) [email](mailto:x@y.com)'), []);
});

void test('Markdown entity-escaped URL matches the literal frontmatter URL', () => {
	assert.deepEqual(extractLinks('[Query](https://example.com/?a=1&amp;b=2)'), ['https://example.com/?a=1&b=2']);
});

void test('frontmatter property is exact, validated and excluded from link extraction', () => {
	const text = '---\ncanonical: https://example.com/a\nurl: [https://example.com/wrong]\ndescription: "[Fake](https://example.com/fake)"\n---\n[Target](https://example.com/b)';
	assert.equal(readNote('a.md', 'A', text, 'url').url, null);
	assert.deepEqual(readNote('a.md', 'A', text, 'canonical').links, ['https://example.com/b']);
	assert.equal(readNote('a.md', 'A', text, 'Canonical').url, null);
	assert.equal(readNote('a.md', 'A', '[link](https://example.com/a)', 'url').url, null);
	assert.throws(() => readNote('a.md', 'A', '---\nurl: [broken\n---', 'url'));
});

void test('graph excludes self-links after normalization while preserving other notes sharing the URL', () => {
	const source = note('a.md', 'https://example.com/a/', '[Self](https://example.com/a#section)');
	const selfOnly = buildGraph([source]);
	assert.equal(selfOnly.nodes.length, 1);
	assert.deepEqual(selfOnly.edges, []);
	const sharedUrl = buildGraph([source, note('copy.md', 'https://example.com/a')]);
	assert.equal(sharedUrl.edges.length, 1);
	assert.equal(sharedUrl.edges[0]!.source, sharedUrl.nodes[0]!.id);
	assert.equal(sharedUrl.edges[0]!.target, sharedUrl.nodes[1]!.id);
});

void test('graph is directed, URL-only, deduplicated, with all duplicate-URL targets and isolated notes', () => {
	const records = [note('a.md', 'https://example.com/a', '[b](https://example.com/b/) [again](https://example.com/b#x) [unknown](https://elsewhere.test)'),
		note('b.md', 'https://example.com/b'), note('copy.md', 'https://example.com/b'), note('isolated.md', 'https://example.com/i'),
		readNote('unindexed.md', 'b', '[b](https://example.com/b)', 'url')];
	const graph = buildGraph(records);
	assert.equal(graph.nodes.length, 4);
	assert.equal(graph.edges.length, 2);
	assert.equal(new Set(graph.edges.map((edge) => edge.id)).size, 2);
	assert.ok(graph.edges.every((edge) => edge.source === graph.nodes[0]!.id));
	const cy = cytoscape({ headless: true, elements: [...graph.nodes, ...graph.edges].map((data) => ({ data })) });
	assert.equal(cy.nodes().length, 4);
	assert.equal(cy.edges().length, 2);
	assert.equal(cy.getElementById(graph.nodes[0]!.id).outgoers('edge').length, 2);
	cy.destroy();
});

class FakeVault {
	files = new Map<string, { file: TFile; content: string }>();
	reads = 0;
	readHook: (() => Promise<void>) | undefined;
	private handlers = new Map<string, Set<(file: TFile) => void>>();
	on(event: string, callback: (file: TFile) => void): () => void {
		const callbacks = this.handlers.get(event) ?? new Set();
		callbacks.add(callback);
		this.handlers.set(event, callbacks);
		return () => { callbacks.delete(callback); };
	}
	emit(event: string, file = new TFile('folder')): void { this.handlers.get(event)?.forEach((callback) => callback(file)); }
	put(path: string, content: string): TFile {
		const file = this.files.get(path)?.file ?? new TFile(path);
		this.files.set(path, { file, content });
		return file;
	}
	getMarkdownFiles(): TFile[] { return [...this.files.values()].map((entry) => entry.file).filter((file) => file.extension === 'md'); }
	async cachedRead(file: TFile): Promise<string> {
		this.reads++;
		const content = this.files.get(file.path)?.content;
		await this.readHook?.();
		if (content === undefined) throw new Error('Missing file');
		return content;
	}
}
const content = (url: string, body = '', property = 'url') => `---\n${property}: ${url}\n---\n${body}`;
async function until(check: () => boolean): Promise<void> {
	const deadline = Date.now() + 5000;
	while (!check()) {
		if (Date.now() > deadline) assert.fail('Timed out waiting for index update');
		await delay(10);
	}
}
function setup(vault: FakeVault, property: () => string = () => 'url', metadataProperties: () => string[] = () => ['language']): UrlIndexer {
	const app = { vault, workspace: { onLayoutReady: (callback: () => void) => callback() } } as unknown as App;
	const indexer = new UrlIndexer(app, property, metadataProperties);
	indexer.load();
	return indexer;
}

void test('index lifecycle: initial scan, debounced edits, create, rename, delete, property change, cleanup', async () => {
	const vault = new FakeVault();
	let property = 'url';
	const a = vault.put('a.md', content('https://example.com/a', '[b](https://example.com/b)'));
	vault.put('b.md', content('https://example.com/b'));
	const indexer = setup(vault, () => property);
	let updates = 0;
	const unsubscribe = indexer.subscribe(() => { updates++; });
	try {
		await until(() => indexer.ready);
		assert.equal(indexer.snapshot.edges.length, 1);
		assert.equal(vault.reads, 2);
		vault.put('a.md', content('https://example.com/a'));
		for (let i = 0; i < 10; i++) vault.emit('modify', a);
		await until(() => updates === 2);
		assert.equal(indexer.snapshot.edges.length, 0);
		assert.equal(vault.reads, 3);
		const c = vault.put('folder/c.md', content('https://example.com/c', '[a](https://example.com/a)'));
		vault.emit('create', c);
		await until(() => updates === 3);
		assert.equal(indexer.snapshot.nodes.length, 3);
		assert.equal(indexer.snapshot.edges.length, 1);
		vault.files.delete('folder/c.md');
		c.path = 'renamed/c.md';
		vault.put(c.path, content('https://example.com/c', '[a](https://example.com/a)'));
		vault.emit('rename');
		await until(() => updates === 4);
		assert.ok(indexer.snapshot.nodes.some((node) => node.path === 'renamed/c.md'));
		assert.ok(!indexer.snapshot.nodes.some((node) => node.path === 'folder/c.md'));
		vault.files.delete('a.md');
		vault.emit('delete', a);
		await until(() => updates === 5);
		assert.equal(indexer.snapshot.edges.length, 0);
		property = 'canonical';
		indexer.rebuild();
		await until(() => updates === 6);
		assert.equal(indexer.snapshot.nodes.length, 0);
		unsubscribe();
	} finally { indexer.unload(); }
	vault.emit('modify', a);
	await delay(400);
	assert.equal(updates, 6);
});

void test('property changes during reads discard old results; malformed YAML is isolated and recoverable', async () => {
	const vault = new FakeVault();
	let property = 'url';
	vault.put('a.md', '---\nurl: https://old.test\ncanonical: https://new.test\n---');
	const bad = vault.put('bad.md', '---\nurl: [broken\n---');
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	vault.readHook = () => gate;
	const indexer = setup(vault, () => property);
	try {
		await until(() => vault.reads > 0);
		property = 'canonical';
		indexer.rebuild();
		release();
		await until(() => indexer.ready);
		assert.deepEqual(indexer.snapshot.nodes.map((node) => node.url), ['https://new.test/']);
		assert.equal(indexer.snapshot.errors, 1);
		vault.put('bad.md', content('https://fixed.test', '', 'canonical'));
		vault.emit('modify', bad);
		await until(() => indexer.snapshot.errors === 0);
		assert.equal(indexer.snapshot.nodes.length, 2);
	} finally { release(); indexer.unload(); }
});

void test('unloading during a read prevents publication', async () => {
	const vault = new FakeVault();
	vault.put('a.md', content('https://example.com/a'));
	let release!: () => void;
	vault.readHook = () => new Promise<void>((resolve) => { release = resolve; });
	const indexer = setup(vault);
	await until(() => vault.reads > 0);
	indexer.unload();
	release();
	await delay(20);
	assert.equal(indexer.ready, false);
	assert.equal(indexer.snapshot.nodes.length, 0);
});

void test('rebuild reports progress immediately and yields between cached-read batches', async () => {
	const vault = new FakeVault();
	for (let i = 0; i < 24; i++) vault.put(`${i}.md`, content(`https://example.com/${i}`));
	const indexer = setup(vault);
	const phases: string[] = [];
	let heartbeatBetweenBatches = false;
	let timerScheduled = false;
	const dispose = indexer.subscribeProgress(() => {
		phases.push(indexer.progress.phase);
		if (indexer.progress.completed === 8 && !timerScheduled) {
			timerScheduled = true;
			window.setTimeout(() => { heartbeatBetweenBatches = vault.reads < 24; }, 0);
		}
	});
	try {
		assert.equal(indexer.progress.phase, 'reading');
		await until(() => indexer.ready);
		assert.equal(heartbeatBetweenBatches, true);
		assert.ok(phases.includes('linking'));
		assert.equal(indexer.progress.phase, 'idle');
		assert.equal(indexer.snapshot.nodes.length, 24);
		indexer.rebuild();
		assert.equal(indexer.progress.phase, 'reading');
		assert.equal(indexer.snapshot.nodes.length, 24, 'Previous graph stays available during rebuild');
	} finally { dispose(); indexer.unload(); }
});

void test('metadata choices follow edits, file creation, deletion and property configuration changes', async () => {
	const vault = new FakeVault();
	const a = vault.put('a.md', '---\nurl: https://example.com/a\nlanguage: de\n---');
	const b = vault.put('b.md', '---\nurl: https://example.com/b\nlanguage: en\n---');
	let properties = ['language'];
	const indexer = setup(vault, () => 'url', () => properties);
	try {
		await until(() => indexer.ready);
		assert.deepEqual(availableMetadataValues(indexer.snapshot, 'language'), ['de', 'en']);
		vault.put('a.md', '---\nurl: https://example.com/a\nlanguage: uk\n---');
		vault.emit('modify', a);
		await until(() => availableMetadataValues(indexer.snapshot, 'language').includes('uk'));
		assert.deepEqual(availableMetadataValues(indexer.snapshot, 'language'), ['en', 'uk']);
		vault.files.delete('b.md'); vault.emit('delete', b);
		await until(() => indexer.snapshot.nodes.length === 1);
		assert.deepEqual(availableMetadataValues(indexer.snapshot, 'language'), ['uk']);
		const c = vault.put('c.md', '---\nurl: https://example.com/c\nlanguage: fr\n---');
		vault.emit('create', c);
		await until(() => indexer.snapshot.nodes.length === 2);
		assert.deepEqual(availableMetadataValues(indexer.snapshot, 'language'), ['fr', 'uk']);
		vault.put('a.md', '---\nurl: https://example.com/a\nstatus: published\nlanguage: uk\n---');
		properties = ['status'];
		indexer.rebuild();
		await until(() => availableMetadataValues(indexer.snapshot, 'status').includes('published'));
		assert.deepEqual(availableMetadataValues(indexer.snapshot, 'language'), []);
	} finally { indexer.unload(); }
});


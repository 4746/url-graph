import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readNote } from '../src/indexing/read-note';
import { buildGraph } from '../src/graph/build';
import { projectGraph } from '../src/graph/project';
import { DEFAULT_GRAPH_OPTIONS } from '../src/graph/options';
import { availableMetadataValues, loadMetadataFilters, parseMetadataProperties, readMetadata } from '../src/graph/metadata';
import { metadataChoices } from '../src/ui/metadata-choices';
import { I18n } from '../src/i18n';
import { loadSettings } from '../src/settings-data';

const keys = ['locale', 'status', 'tags'];
const note = (path: string, yaml: string, body = '') => readNote(path, path,
	`---\nurl: https://example.com/${path}\n${yaml}\n---\n${body}`, 'url', keys);

void test('configured properties support trimmed scalar values and lists while ignoring nested objects', () => {
	const record = note('a.md', 'locale: " de "\nstatus: false\ntags: [seo, pricing, seo, null, {nested: value}]\nlanguage: en');
	assert.deepEqual(record.metadata, { locale: ['de'], status: ['false'], tags: ['seo', 'pricing'] });
	assert.deepEqual(note('b.md', 'locale: null\nstatus: 123\ntags: {}').metadata, { locale: [], status: ['123'], tags: [] });
	assert.deepEqual(parseMetadataProperties(' locale, status, locale, , Tags '), ['locale', 'status', 'Tags']);
	assert.deepEqual(parseMetadataProperties(''), []);
	assert.deepEqual(Object.entries(readMetadata({}, ['toString'])), [['toString', []]]);
});

void test('multiple metadata filters intersect and lists match membership without creating new edges', () => {
	const graph = buildGraph([
		note('a.md', 'locale: de\nstatus: published\ntags: [seo, pricing]', '[b](https://example.com/b.md) [c](https://example.com/c.md)'),
		note('b.md', 'locale: de\nstatus: published\ntags: [seo]'),
		note('c.md', 'locale: de\nstatus: draft\ntags: [pricing]'),
		note('d.md', 'locale: en\nstatus: published'), note('missing.md', ''),
	]);
	const options = { ...DEFAULT_GRAPH_OPTIONS, metadataProperties: keys, metadataFilters: { locale: 'de', status: 'published', tags: 'seo' } };
	const filtered = projectGraph(graph, options);
	assert.deepEqual(filtered.nodes.map((node) => node.path), ['a.md', 'b.md']);
	assert.equal(filtered.edges.length, 1);
	assert.equal(graph.edges.length, 2);
	assert.equal(projectGraph(graph, { ...options, metadataFilters: {} }).nodes.length, 5);
	assert.equal(projectGraph(graph, { ...options, metadataFilters: { locale: 'DE' } }).nodes.length, 0);
	assert.equal(projectGraph(graph, { ...options, metadataFilters: { locale: 'fr' } }).nodes.length, 0);
	assert.equal(projectGraph(graph, { ...options, metadataProperties: [] }).nodes.length, 5);
});

void test('property choices use the full URL index and retain unavailable selections with localized labels', () => {
	const graph = buildGraph([
		note('a.md', 'locale: de'), note('b.md', 'locale: en'), note('copy.md', 'locale: de'),
		readNote('no-url.md', 'No URL', '---\nlocale: fr\n---', 'url', keys),
	]);
	assert.deepEqual(availableMetadataValues(graph, 'locale'), ['de', 'en']);
	assert.deepEqual(availableMetadataValues(graph, 'language'), []);
	assert.deepEqual(availableMetadataValues(graph, 'toString'), []);
	const i18n = new I18n('uk', () => 'en');
	assert.deepEqual(metadataChoices(graph, 'locale', 'de', i18n), [['', 'Усі значення'], ['de', 'de'], ['en', 'en']]);
	assert.deepEqual(metadataChoices(graph, 'locale', 'fr', i18n).at(-1), ['fr', 'fr (немає в індексі)']);
	i18n.setLanguage('en');
	assert.equal(metadataChoices(graph, 'locale', 'de', i18n)[0]![1], 'All values');
});

void test('legacy language selections migrate while explicit new configuration overrides them', () => {
	assert.deepEqual(loadSettings({ filterLanguage: ' de ' }).metadataFilters, { language: 'de' });
	assert.deepEqual(loadSettings({}).metadataProperties, ['language']);
	const saved = loadSettings({ language: 'uk', metadataProperties: 'locale, status', metadataFilters: { locale: ' de ', status: 'published', language: 'en', hidden: 'x' } });
	assert.deepEqual(saved.metadataProperties, ['locale', 'status']);
	assert.deepEqual(saved.metadataFilters, { locale: 'de', status: 'published' });
	assert.equal(saved.language, 'uk');
	assert.deepEqual(loadSettings({ metadataProperties: '', filterLanguage: 'de' }).metadataFilters, {});
	assert.deepEqual(loadSettings({ metadataFilters: {}, filterLanguage: 'de' }).metadataFilters, {});
	assert.deepEqual(loadMetadataFilters({ status: 'published', locale: 'de' }, ['locale']), { locale: 'de' });
});

void test('metadata filters combine with folders, domains and isolation without metadata-based links', () => {
	const graph = buildGraph([note('blog/a.md', 'locale: de'), note('blog/b.md', 'locale: de'), note('c.md', 'locale: en')]);
	assert.equal(graph.edges.length, 0);
	const options = { ...DEFAULT_GRAPH_OPTIONS, metadataProperties: keys, metadataFilters: { locale: 'de' }, includeFolders: ['blog'], includeDomains: ['example.com'] };
	assert.equal(projectGraph(graph, options).nodes.length, 2);
	assert.equal(projectGraph(graph, { ...options, showIsolated: false }).nodes.length, 0);
	assert.equal(projectGraph(graph, { ...options, excludeDomains: ['example.com'] }).nodes.length, 0);
});

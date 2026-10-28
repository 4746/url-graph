import assert from 'node:assert/strict';
import { test } from 'node:test';
import type UrlGraphPlugin from '../src/main';
import { ConnectionsController } from '../src/ui/connections-controller';
import { TFile } from './obsidian';
import { I18n } from '../src/i18n';
import { DEFAULT_SETTINGS } from '../src/settings-data';

void test('connections controller follows Markdown files, keeps graph selection, handles renames and cleans up listeners', async () => {
	let active: TFile | null = new TFile('folder/a.md');
	let fileOpen: ((file: TFile | null) => void) | undefined;
	let activeLeaf: ((leaf: { view: { getViewType(): string } } | null) => void) | undefined;
	let rename: ((file: TFile, oldPath: string) => void) | undefined;
	let sidebarCreated = false;
	let backlinkReplaced = false;
	let revealed = 0;
	const leaf = { setViewState: () => { sidebarCreated = true; return Promise.resolve(); } };
	const backlink = { setViewState: () => { backlinkReplaced = true; return Promise.resolve(); } };
	const plugin = {
		i18n: new I18n('en', () => 'en'),
		settings: { ...DEFAULT_SETTINGS },
		saveSettings: () => Promise.resolve(),
		indexer: { snapshot: { nodes: [
			{ id: 'a', path: 'folder/a.md', label: 'A', url: 'https://example.com/a' },
			{ id: 'b', path: 'folder/b.md', label: 'B', url: 'https://example.com/b' },
		], edges: [{ id: 'ab', source: 'a', target: 'b' }], errors: 0 } },
		registerView: () => {},
		app: {
			workspace: {
				on: (event: string, callback: unknown) => {
					if (event === 'file-open') fileOpen = callback as typeof fileOpen;
					if (event === 'active-leaf-change') activeLeaf = callback as typeof activeLeaf;
					return () => { if (event === 'file-open') fileOpen = undefined; else activeLeaf = undefined; };
				},
				onLayoutReady: (callback: () => void) => callback(),
				getActiveFile: () => active,
				getLeavesOfType: (type: string) => type === 'backlink' ? [backlink] : sidebarCreated ? [leaf] : [],
				getRightLeaf: () => backlink,
				ensureSideLeaf: (type: string, side: string) => {
					assert.equal(type, 'url-graph-connections'); assert.equal(side, 'right');
					sidebarCreated = true; return Promise.resolve(leaf);
				},
				revealLeaf: () => { revealed++; return Promise.resolve(); },
			},
			vault: {
				on: (_event: string, callback: (file: TFile, oldPath: string) => void) => {
					rename = callback; return () => { rename = undefined; };
				},
			},
		},
	} as unknown as UrlGraphPlugin;
	const controller = new ConnectionsController(plugin);
	controller.load();
	try {
		assert.equal(controller.selection.path, 'folder/a.md');
		assert.equal(controller.highlightPath, null);
		fileOpen?.(null);
		assert.equal(controller.selection.path, 'folder/a.md');
		fileOpen?.(new TFile('folder/b.md'));
		assert.equal(controller.selection.path, 'folder/b.md');
		rename?.(new TFile('renamed'), 'folder');
		assert.equal(controller.selection.path, 'renamed/b.md');
		await controller.show('graph-node.md');
		assert.equal(controller.selection.path, 'graph-node.md');
		assert.equal(controller.highlightPath, 'graph-node.md');
		assert.equal(sidebarCreated, true);
		assert.equal(backlinkReplaced, false, 'Opening URL connections must preserve core backlinks');
		active = new TFile('current.md');
		await controller.show();
		assert.equal(controller.selection.path, 'current.md');
		controller.clearHighlight();
		assert.equal(controller.highlightPath, null);
		assert.equal(controller.selection.path, 'current.md');
		assert.equal(revealed, 2);
		await controller.show('folder/a.md');
		await controller.showOnGraph('folder/b.md');
		assert.equal(controller.selection.path, 'folder/a.md', 'Focusing a target must preserve the original list');
		for (const type of ['url-graph-view', 'url-graph-local-view', 'url-graph-connections']) {
			activeLeaf?.({ view: { getViewType: () => type } });
			assert.equal(controller.selection.path, 'folder/a.md');
		}
		activeLeaf?.({ view: { getViewType: () => 'canvas' } });
		assert.equal(controller.selection.path, null);
		assert.equal(controller.highlightPath, null);
		await controller.show('folder/a.md');
		fileOpen?.(new TFile('other.pdf'));
		assert.equal(controller.selection.path, null);
		await controller.show('folder/a.md');
		fileOpen?.(new TFile('folder/b.md'));
		assert.equal(controller.selection.path, 'folder/b.md');
		assert.equal(controller.highlightPath, null);
		controller.clearSelection();
		assert.equal(controller.selection.path, null);
		await controller.show('folder/a.md');
		activeLeaf?.(null);
		assert.equal(controller.selection.path, null);
	} finally { controller.unload(); }
	assert.equal(fileOpen, undefined);
	assert.equal(rename, undefined);
	assert.equal(activeLeaf, undefined);
});

void test('one-time migration restores a clobbered core backlinks tab without changing URL connections', async () => {
	const created: Array<{ type: string; side: string; options: unknown }> = [];
	let replaced = false;
	let backlinkExists = false;
	let saves = 0;
	const oldUrlLeaf = { setViewState: () => { replaced = true; return Promise.resolve(); } };
	const plugin = {
		settings: { ...DEFAULT_SETTINGS },
		registerView: () => {},
		saveSettings: () => { saves++; return Promise.resolve(); },
		app: { workspace: {
			on: () => () => {}, onLayoutReady: (callback: () => void) => callback(), getActiveFile: () => null,
			getLeavesOfType: (type: string) => type === 'url-graph-connections' ? [oldUrlLeaf] : backlinkExists ? [{}] : [],
			ensureSideLeaf: (type: string, side: string, options: unknown) => {
				created.push({ type, side, options }); backlinkExists = true; return Promise.resolve({});
			},
		}, vault: { on: () => () => {} } },
	} as unknown as UrlGraphPlugin;
	const first = new ConnectionsController(plugin);
	first.load();
	await Promise.resolve();
	assert.deepEqual(created, [{ type: 'backlink', side: 'right', options: { active: false, reveal: false } }]);
	assert.equal(replaced, false);
	assert.equal(plugin.settings.sidebarTabMigrationDone, true);
	assert.equal(saves, 1);
	first.unload();
	// Closing backlinks intentionally after migration must not cause automatic reopening.
	backlinkExists = false;
	const second = new ConnectionsController(plugin);
	second.load();
	await Promise.resolve();
	assert.equal(created.length, 1);
	second.unload();
});

void test('local graph action always opens a fresh tab without reusing the global graph or sidebar', async () => {
	const states: unknown[] = [];
	const newLeaves: object[] = [];
	const revealed: object[] = [];
	const plugin = { app: { workspace: {
		getLeaf: (kind: string) => {
			assert.equal(kind, 'tab');
			const leaf = { setViewState: (state: unknown) => { states.push(state); return Promise.resolve(); } };
			newLeaves.push(leaf);
			return leaf;
		},
		revealLeaf: (leaf: object) => { revealed.push(leaf); return Promise.resolve(); },
	} } } as unknown as UrlGraphPlugin;
	const controller = new ConnectionsController(plugin);
	await controller.openLocalGraph('a.md');
	await controller.openLocalGraph('b.md');
	assert.equal(newLeaves.length, 2);
	assert.notEqual(newLeaves[0], newLeaves[1]);
	assert.deepEqual(revealed, newLeaves);
	assert.deepEqual(states, [
		{ type: 'url-graph-local-view', state: { rootPath: 'a.md' }, active: true },
		{ type: 'url-graph-local-view', state: { rootPath: 'b.md' }, active: true },
	]);
	assert.equal(controller.selection.path, null, 'Opening a local tab does not replace the sidebar selection');
});

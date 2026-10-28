import { Component, Notice, TFile } from 'obsidian';
import type UrlGraphPlugin from '../main';
import { ConnectionSelection, noteConnections } from '../graph/connections';
import { projectGraph } from '../graph/project';
import { CONNECTIONS_VIEW, ConnectionsView } from './connections-view';
import { URL_GRAPH_VIEW, UrlGraphView } from './graph-view';
import { URL_LOCAL_GRAPH_VIEW } from './local-graph-view';

export class ConnectionsController extends Component {
	readonly selection = new ConnectionSelection();
	private pinned = false;
	constructor(private plugin: UrlGraphPlugin) { super(); }
	get highlightPath(): string | null { return this.pinned ? this.selection.path : null; }
	clearHighlight(): void { this.pinned = false; this.selection.select(this.selection.path, true); }
	clearSelection(): void { this.pinned = false; this.selection.select(null); }

	onload(): void {
		const { app } = this.plugin;
		this.plugin.registerView(CONNECTIONS_VIEW, (leaf) => new ConnectionsView(leaf, this.plugin, this));
		this.registerEvent(app.workspace.on('file-open', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				this.pinned = false;
				this.selection.select(file.path, true);
			} else if (file) this.clearSelection();
		}));
		this.registerEvent(app.workspace.on('active-leaf-change', (leaf) => {
			const type = leaf?.view.getViewType();
			if (type === CONNECTIONS_VIEW || type === URL_GRAPH_VIEW || type === URL_LOCAL_GRAPH_VIEW) return;
			const file = type === 'markdown' ? app.workspace.getActiveFile() : null;
			if (file?.extension === 'md') {
				this.pinned = false;
				this.selection.select(file.path, true);
			} else this.clearSelection();
		}));
		this.registerEvent(app.vault.on('rename', (file, oldPath) => {
			const path = this.selection.path;
			if (path === oldPath || path?.startsWith(`${oldPath}/`)) this.selection.select(file.path + path.slice(oldPath.length));
		}));
		app.workspace.onLayoutReady(() => {
			const file = app.workspace.getActiveFile();
			if (file?.extension === 'md') this.selection.select(file.path);
			void this.repairSidebar();
		});
	}

	private async repairSidebar(): Promise<void> {
		if (this.plugin.settings.sidebarTabMigrationDone) return;
		const { workspace } = this.plugin.app;
		try {
			if (workspace.getLeavesOfType(CONNECTIONS_VIEW).length && !workspace.getLeavesOfType('backlink').length) {
				await workspace.ensureSideLeaf('backlink', 'right', { active: false, reveal: false });
			}
			this.plugin.settings.sidebarTabMigrationDone = true;
			await this.plugin.saveSettings();
		} catch {
			// The built-in backlinks view may be unavailable if its core plugin is disabled.
		}
	}

	async show(path?: string): Promise<void> {
		const { workspace } = this.plugin.app;
		const file = workspace.getActiveFile();
		this.pinned = true;
		this.selection.select(path ?? (file?.extension === 'md' ? file.path : this.selection.path), true);
		let leaf = workspace.getLeavesOfType(CONNECTIONS_VIEW)[0];
		if (!leaf) {
			leaf = await workspace.ensureSideLeaf(CONNECTIONS_VIEW, 'right', { active: true, reveal: false });
		}
		await workspace.revealLeaf(leaf);
	}

	async openNote(path: string): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) { new Notice(this.plugin.i18n.t('notice.openFailed')); return; }
		try { await this.plugin.app.workspace.getLeaf('tab').openFile(file); }
		catch { new Notice(this.plugin.i18n.t('notice.openFailed')); }
	}

	async openLocalGraph(path: string): Promise<void> {
		const { workspace } = this.plugin.app;
		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({ type: URL_LOCAL_GRAPH_VIEW, state: { rootPath: path }, active: true });
		await workspace.revealLeaf(leaf);
	}

	async showOnGraph(path: string, neighborhood = false): Promise<void> {
		const { indexer, settings, i18n } = this.plugin;
		const visible = projectGraph(indexer.snapshot, settings);
		const visiblePaths = new Set(visible.nodes.map((node) => node.path));
		if (!visiblePaths.has(path)) { new Notice(i18n.t('connections.hiddenNotice')); return; }
		this.pinned = true;
		// Focusing a listed target must keep the source note's connection list open.
		this.selection.select(this.selection.path ?? path, true);
		const { workspace } = this.plugin.app;
		let leaf = workspace.getLeavesOfType(URL_GRAPH_VIEW)[0];
		if (!leaf) {
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: URL_GRAPH_VIEW, active: true });
		}
		await workspace.revealLeaf(leaf);
		if (leaf.view instanceof UrlGraphView) leaf.view.focusNote(path, neighborhood);
		if (neighborhood) {
			const links = noteConnections(indexer.snapshot, path);
			if ([...links.incoming, ...links.outgoing].some((node) => !visiblePaths.has(node.path))) {
				new Notice(i18n.t('connections.partialNotice'));
			}
		}
	}
}

import { registerNodeTooltip } from './node-tooltip';
import { ItemView, Notice, TFile, type Menu, type IconName, type WorkspaceLeaf } from 'obsidian';
import cytoscape, { type Core, type EventObjectNode } from 'cytoscape';
import type { UrlIndexer } from '../indexing/indexer';
import { graphStyle } from './graph-style';
import type { I18n } from '../i18n';
import type { TranslationKey } from '../i18n/locales/en';
import type { GraphPreferences } from '../graph/preferences';
import type { DisplayGraph } from '../graph/project';
import { GraphRenderer, type RenderPhase } from './graph-renderer';
import { loadingText } from './loading';
import { clearHoverHighlight, registerHoverHighlight } from './hover-highlight';
import { MetadataFilters } from './metadata-filters';
import type { ConnectionsController } from './connections-controller';
import { focusGraph, pinConnections } from './graph-focus';
import { registerNodeMenu } from './graph-node-menu';
import type { GraphSnapshot } from '../graph/types';
import { URL_GRAPH_ICON } from './icons';

export const URL_GRAPH_VIEW = 'url-graph-view';

export class UrlGraphView extends ItemView {
	private cy: Core | undefined;
	private canvas!: HTMLElement;
	private status!: HTMLElement;
	private empty!: HTMLElement;
	private loader!: HTMLElement;
	private loaderText!: HTMLElement;
	private unsubscribe: (() => void) | undefined;
	private observer: ResizeObserver | undefined;
	private visibleGraph: DisplayGraph | undefined;
	private settingsTimer: number | undefined;
	private renderer: GraphRenderer | undefined;
	private renderPhase: RenderPhase = null;
	private metadataFilters: MetadataFilters | undefined;
	private pendingFocus: { path: string; neighborhood: boolean } | undefined;
	private scopeCaption: HTMLElement | undefined;

	constructor(leaf: WorkspaceLeaf, protected indexer: UrlIndexer, protected i18n: I18n,
		private preferences: GraphPreferences, private setMetadataFilter: (property: string, value: string) => void,
		private connections: ConnectionsController, private openSettings: () => void) { super(leaf); }
	getViewType(): string { return URL_GRAPH_VIEW; }
	getDisplayText(): string { return this.i18n.t('graph.title'); }
	getIcon(): string { return URL_GRAPH_ICON; }
	onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu(menu, source);
		const busy = loadingText(this.i18n, this.indexer.progress, this.renderPhase) !== null;
		const actions: Array<[TranslationKey, IconName, () => void, boolean]> = [
			['graph.fit', 'maximize', () => this.cy?.fit(undefined, 45), busy],
			['graph.arrange', 'network', () => this.renderGraph(true, true), busy],
			['graph.rebuild', 'refresh-cw', () => this.indexer.rebuild(), busy],
		];
		const root = this.getRootPath();
		if (root) actions.push(['connections.show', 'list-tree', () => { void this.connections.show(root); }, false]);
		actions.push(['graph.settings', 'settings-2', this.openSettings, false]);
		menu.addSeparator();
		for (const [key, icon, callback, disabled] of actions) {
			menu.addItem((item) => item.setTitle(this.i18n.t(key)).setIcon(icon).setDisabled(disabled).onClick(callback));
		}
		menu.addSeparator();
	}
	protected getRootPath(): string | null { return null; }
	protected graphSnapshot(): GraphSnapshot { return this.indexer.snapshot; }
	protected renderGraph(forceLayout = false, fit = false): void {
		if (this.indexer.ready && this.indexer.progress.phase === 'idle') this.renderer?.request(this.graphSnapshot(), forceLayout, fit);
	}

	onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('url-graph-view');
		const toolbar = this.contentEl.createDiv({ cls: 'url-graph-toolbar' });
		this.metadataFilters = new MetadataFilters(toolbar, this.i18n, this.setMetadataFilter);
		this.updateMetadataFilters();
		this.status = toolbar.createSpan({ cls: 'url-graph-status', attr: { role: 'status', 'aria-live': 'polite' } });
		this.scopeCaption = this.contentEl.createDiv({ cls: 'url-graph-scope-caption is-hidden' });
		const stage = this.contentEl.createDiv({ cls: 'url-graph-stage' });
		this.canvas = stage.createDiv({ cls: 'url-graph-canvas' });
		this.empty = stage.createDiv({ cls: 'url-graph-empty' });
		this.loader = stage.createDiv({ cls: 'url-graph-loader is-hidden', attr: { role: 'status', 'aria-live': 'polite' } });
		this.loader.createDiv({ cls: 'url-graph-spinner', attr: { 'aria-hidden': 'true' } });
		this.loaderText = this.loader.createSpan();
		this.cy = cytoscape({
			container: this.canvas, elements: [], style: graphStyle(this.canvas, this.preferences.get()),
			minZoom: 0.08, maxZoom: 5, wheelSensitivity: 0.25,
			layout: { name: 'preset' },
		});
		this.cy.on('tap', 'node', (event: EventObjectNode) => {
			const path: unknown = event.target.data('path');
			if (typeof path === 'string') void this.openNote(path);
		});
		this.register(registerHoverHighlight(this.cy));
		this.register(registerNodeTooltip(this.cy, stage, this.preferences, this.i18n));
		this.register(registerNodeMenu(this.cy, this.canvas, this.i18n, (path) => this.connections.show(path),
			(path) => this.connections.openLocalGraph(path)));
		this.register(this.connections.selection.subscribe(() => this.refreshPinned()));
		this.registerDomEvent(this.canvas, 'mouseleave', () => {
			if (this.cy) clearHoverHighlight(this.cy);
		});
		this.registerEvent(this.app.workspace.on('css-change', () => {
			this.cy?.style(graphStyle(this.canvas, this.preferences.get()));
		}));
		this.observer = new ResizeObserver(() => this.cy?.resize());
		this.observer.observe(this.canvas);
		this.renderer = new GraphRenderer(this.cy, this.canvas, this.preferences,
			(phase) => {
				if (phase === 'rendering' && this.cy) clearHoverHighlight(this.cy);
				this.renderPhase = phase;
				this.updateText();
				if (phase === null) { this.refreshPinned(); this.applyFocus(); }
			},
			(graph) => { this.visibleGraph = graph; this.updateText(); },
			() => { new Notice(this.i18n.t('notice.graphFailed')); });
		this.unsubscribe = this.indexer.subscribe(() => {
			this.updateMetadataFilters();
			// A published snapshot can arrive just before the progress state becomes idle.
			this.renderer?.request(this.graphSnapshot());
		});
		this.register(this.indexer.subscribeProgress(() => {
			if (this.indexer.progress.phase === 'reading') this.renderer?.pause();
			this.updateText();
		}));
		this.register(() => this.disposeGraph());
		this.register(this.i18n.subscribe(() => { this.updateMetadataFilters(); this.updateText(); }));
		this.register(this.preferences.subscribe(() => this.queueSettings()));
		this.renderGraph();
		this.updateText();
		return Promise.resolve();
	}

	focusNote(path: string, neighborhood = false): void {
		this.pendingFocus = { path, neighborhood };
		this.applyFocus();
	}

	private refreshPinned(): void {
		if (this.cy) pinConnections(this.cy, this.getRootPath() ?? this.connections.highlightPath);
	}

	private applyFocus(): void {
		if (!this.cy || !this.pendingFocus || this.renderPhase !== null || this.indexer.progress.phase === 'reading'
			|| this.indexer.progress.phase === 'linking') return;
		const { path, neighborhood } = this.pendingFocus;
		this.pendingFocus = undefined;
		this.cy.resize();
		if (!focusGraph(this.cy, path, neighborhood)) new Notice(this.i18n.t('connections.hiddenNotice'));
		this.refreshPinned();
	}

	private queueSettings(): void {
		this.updateMetadataFilters();
		if (!this.cy) return;
		if (this.settingsTimer !== undefined) window.clearTimeout(this.settingsTimer);
		this.settingsTimer = window.setTimeout(() => {
			this.settingsTimer = undefined;
			this.renderGraph();
		}, 150);
	}

	private updateMetadataFilters(): void {
		const options = this.preferences.get();
		this.metadataFilters?.update(this.indexer.snapshot, options.metadataProperties, options.metadataFilters);
	}

	private async openNote(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) { this.indexer.rebuild(); return; }
		try { await this.app.workspace.getLeaf('tab').openFile(file); }
		catch { new Notice(this.i18n.t('notice.openFailed')); }
	}

	private updateText(): void {
		if (!this.cy) return;
		const root = this.getRootPath();
		this.scopeCaption?.setText(root ? this.i18n.t('graph.localFor', { path: root }) : '');
		this.scopeCaption?.toggleClass('is-hidden', !root);
		const loading = loadingText(this.i18n, this.indexer.progress, this.renderPhase);
		this.loader.toggleClass('is-hidden', loading === null);
		this.loaderText.setText(loading ?? '');
		this.canvas.setAttribute('aria-busy', String(loading !== null));
		this.canvas.setAttribute('aria-label', this.i18n.t('graph.accessibility'));
		const { nodes, edges, errors } = this.visibleGraph ?? this.graphSnapshot();
		const connectionCount = this.visibleGraph?.connectionCount ?? edges.length;
		this.status.setText(loading ?? (this.indexer.progress.phase === 'error' ? this.i18n.t('graph.indexFailed') : this.indexer.ready
			? this.i18n.t('graph.stats', { notes: nodes.length, links: connectionCount })
				+ (errors ? this.i18n.t('graph.errors', { errors }) : '')
			: this.i18n.t('graph.indexing')));
		this.empty.setText(this.indexer.progress.phase === 'error' ? this.i18n.t('graph.indexFailed') : this.indexer.ready
			? this.i18n.t(root && !this.graphSnapshot().nodes.length ? 'graph.localMissing' : this.graphSnapshot().nodes.length ? 'graph.filteredEmpty' : 'graph.empty')
			: this.i18n.t('graph.building'));
		this.empty.toggleClass('is-hidden', nodes.length > 0 || loading !== null);
	}

	onResize(): void { this.cy?.resize(); }

	private disposeGraph(): void {
		this.pendingFocus = undefined;
		this.renderer?.dispose();
		this.renderer = undefined;
		if (this.settingsTimer !== undefined) window.clearTimeout(this.settingsTimer);
		this.settingsTimer = undefined;
		this.visibleGraph = undefined;
		this.metadataFilters = undefined;
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.observer?.disconnect();
		this.observer = undefined;
		this.cy?.destroy();
		this.cy = undefined;
	}

	onClose(): Promise<void> {
		this.disposeGraph();
		this.contentEl.empty();
		return Promise.resolve();
	}
}

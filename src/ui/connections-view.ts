import { ItemView, setIcon, setTooltip, type IconName, type WorkspaceLeaf } from 'obsidian';
import type UrlGraphPlugin from '../main';
import type { ConnectionsController } from './connections-controller';
import { noteConnections } from '../graph/connections';
import type { GraphNode } from '../graph/types';
import { projectGraph } from '../graph/project';

export const CONNECTIONS_VIEW = 'url-graph-connections';

export class ConnectionsView extends ItemView {
	private timer: number | undefined;
	private closed = false;
	private expanded = { outgoing: true, incoming: false };
	constructor(leaf: WorkspaceLeaf, private plugin: UrlGraphPlugin, private controller: ConnectionsController) { super(leaf); }
	getViewType(): string { return CONNECTIONS_VIEW; }
	getDisplayText(): string { return this.plugin.i18n.t('connections.title'); }
	getIcon(): string { return 'git-fork'; }

	onOpen(): Promise<void> {
		this.closed = false;
		this.contentEl.addClass('url-graph-connections');
		this.register(this.plugin.indexer.subscribe(() => this.render()));
		this.register(this.plugin.i18n.subscribe(() => this.render()));
		this.register(this.controller.selection.subscribe(() => this.render()));
		this.register(this.plugin.graphPreferences.subscribe(() => {
			if (this.timer !== undefined) window.clearTimeout(this.timer);
			this.timer = window.setTimeout(() => { this.timer = undefined; this.render(); }, 100);
		}));
		this.registerDomEvent(this.contentEl, 'click', (event) => {
			const target = event.target;
			if (!target || !('closest' in target)) return;
			const button = (target as Element).closest<HTMLButtonElement>('button[data-action]');
			if (button?.dataset.action === 'close') {
				this.controller.clearSelection();
				this.leaf.detach();
				return;
			}
			const path = button?.dataset.path;
			if (!path || !button || button.disabled) return;
			if (button.dataset.action === 'unpin') this.controller.clearHighlight();
			else if (button.dataset.action === 'open') void this.controller.openNote(path);
			else void this.controller.showOnGraph(path, button.dataset.action === 'fit');
		});
		this.registerDomEvent(this.contentEl, 'toggle', (event) => {
			const details = event.target as HTMLDetailsElement | null;
			const direction = details?.dataset.direction;
			if (details?.tagName === 'DETAILS' && (direction === 'incoming' || direction === 'outgoing')) {
				this.expanded[direction] = details.open;
			}
		}, true);
		this.render();
		return Promise.resolve();
	}

	private action(parent: HTMLElement, text: string, action: string, path: string, disabled = false,
		icon?: IconName): HTMLButtonElement {
		const button = parent.createEl('button', { text: icon ? '' : text, cls: icon ? 'url-graph-connection-icon clickable-icon' : 'url-graph-connection-link' });
		button.dataset.action = action;
		button.dataset.path = path;
		button.disabled = disabled;
		button.setAttribute('aria-label', text);
		if (icon) { setIcon(button, icon); setTooltip(button, text); }
		return button;
	}

	private render(): void {
		if (this.closed) return;
		const { i18n, indexer, settings } = this.plugin;
		this.contentEl.empty();
		const header = this.contentEl.createDiv({ cls: 'url-graph-connections-header' });
		header.createEl('h4', { text: i18n.t('connections.title') });
		const actions = header.createDiv({ cls: 'url-graph-connections-actions' });
		const path = this.controller.selection.path;
		if (path && this.controller.highlightPath) this.action(actions, i18n.t('connections.clearHighlight'), 'unpin', path, false, 'eraser');
		this.action(actions, i18n.t('connections.close'), 'close', '', false, 'x');
		if (!path) { this.contentEl.createEl('p', { text: i18n.t('connections.chooseNote') }); return; }
		if (!indexer.ready) { this.contentEl.createEl('p', { text: i18n.t('graph.indexing') }); return; }
		const connections = noteConnections(indexer.snapshot, path);
		if (!connections.note) { this.contentEl.createEl('p', { text: i18n.t('connections.notIndexed') }); return; }
		const selected = this.contentEl.createDiv({ cls: 'url-graph-connection-current' });
		selected.createDiv({ text: connections.note.label, cls: 'url-graph-connection-current-name', attr: { title: connections.note.label } });
		selected.createDiv({ text: path, cls: 'url-graph-connection-path', attr: { title: path } });
		const visible = new Set(projectGraph(indexer.snapshot, settings).nodes.map((node) => node.id));
		if (!visible.has(connections.note.id)) selected.createSpan({ text: i18n.t('connections.hidden'), cls: 'url-graph-connection-hidden' });
		this.action(selected, i18n.t('connections.fit'), 'fit', path, !visible.has(connections.note.id), 'scan');
		this.section('outgoing', connections.outgoing, visible);
		this.section('incoming', connections.incoming, visible);
	}

	private section(direction: 'outgoing' | 'incoming', nodes: GraphNode[], visible: Set<string>): void {
		const { i18n } = this.plugin;
		const section = this.contentEl.createEl('details', { cls: 'url-graph-connection-section' });
		section.dataset.direction = direction;
		section.open = this.expanded[direction];
		const summary = section.createEl('summary', { cls: 'url-graph-connection-summary' });
		setIcon(summary.createSpan({ cls: 'url-graph-connection-chevron' }), 'chevron-right');
		summary.createSpan({ text: i18n.t(direction === 'outgoing' ? 'connections.outgoingLabel' : 'connections.incomingLabel') });
		summary.createSpan({ text: String(nodes.length), cls: 'url-graph-connection-count' });
		if (!nodes.length) { section.createEl('p', { text: i18n.t('connections.empty'), cls: 'url-graph-connection-empty' }); return; }
		const list = section.createEl('ul', { cls: 'url-graph-connection-list' });
		for (const node of nodes) {
			const row = list.createEl('li', { cls: 'url-graph-connection-row' });
			const link = this.action(row, i18n.t('connections.openNote', { note: node.label }), 'open', node.path);
			link.empty();
			link.createSpan({ text: node.label, cls: 'url-graph-connection-name' });
			link.createSpan({ text: node.path, cls: 'url-graph-connection-path', attr: { title: node.path } });
			if (!visible.has(node.id)) link.createSpan({ text: i18n.t('connections.hidden'), cls: 'url-graph-connection-hidden' });
			this.action(row, i18n.t('connections.showOnGraph'), 'focus', node.path, !visible.has(node.id), 'locate-fixed');
		}
	}

	onClose(): Promise<void> {
		this.closed = true;
		this.controller.clearSelection();
		if (this.timer !== undefined) window.clearTimeout(this.timer);
		this.contentEl.empty();
		return Promise.resolve();
	}
}

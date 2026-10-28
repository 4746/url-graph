import { getLanguage, Notice, Plugin } from 'obsidian';
import { I18n } from './i18n';
import { UrlIndexer } from './indexing/indexer';
import { DEFAULT_SETTINGS, loadSettings, UrlGraphSettingTab, type UrlGraphSettings } from './settings';
import { URL_GRAPH_VIEW } from './ui/graph-view';
import { registerControls } from './ui/plugin-controls';
import { GraphPreferences } from './graph/preferences';
import { ConnectionsController } from './ui/connections-controller';
import { registerGraphViews } from './ui/register-graph-views';

export default class UrlGraphPlugin extends Plugin {
	settings: UrlGraphSettings = { ...DEFAULT_SETTINGS };
	indexer!: UrlIndexer;
	i18n!: I18n;
	connections!: ConnectionsController;
	graphPreferences = new GraphPreferences(() => this.settings);

	async onload(): Promise<void> {
		this.settings = loadSettings(await this.loadData());
		this.i18n = new I18n(this.settings.language, getLanguage);
		this.indexer = this.addChild(new UrlIndexer(this.app, () => this.settings.urlProperty, () => this.settings.metadataProperties));
		this.connections = this.addChild(new ConnectionsController(this));
		registerGraphViews(this);
		registerControls(this, this.i18n, () => this.openGraph(), () => this.indexer.rebuild(), () => this.connections.show());
		this.addSettingTab(new UrlGraphSettingTab(this.app, this));
	}

	async saveSettings(rebuildIndex = false): Promise<void> {
		this.i18n.setLanguage(this.settings.language);
		this.graphPreferences.notify();
		if (rebuildIndex) this.indexer.rebuild();
		try { await this.saveData(this.settings); }
		catch { new Notice(this.i18n.t('notice.saveFailed')); }
	}

	private async openGraph(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(URL_GRAPH_VIEW)[0];
		const leaf = existing ?? this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: URL_GRAPH_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}
}

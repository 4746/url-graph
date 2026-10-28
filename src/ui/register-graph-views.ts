import type { WorkspaceLeaf } from 'obsidian';
import type UrlGraphPlugin from '../main';
import { URL_GRAPH_VIEW, UrlGraphView } from './graph-view';
import { URL_LOCAL_GRAPH_VIEW, LocalGraphView } from './local-graph-view';
import { GraphSettingsModal } from './graph-settings-modal';

export function registerGraphViews(plugin: UrlGraphPlugin): void {
	const create = (leaf: WorkspaceLeaf, local: boolean) => {
		const View = local ? LocalGraphView : UrlGraphView;
		return new View(leaf, plugin.indexer, plugin.i18n, plugin.graphPreferences, (property, value) => {
			plugin.settings.metadataFilters = { ...plugin.settings.metadataFilters, [property]: value };
			void plugin.saveSettings();
		}, plugin.connections, () => new GraphSettingsModal(plugin).open());
	};
	plugin.registerView(URL_GRAPH_VIEW, (leaf) => create(leaf, false));
	plugin.registerView(URL_LOCAL_GRAPH_VIEW, (leaf) => create(leaf, true));
}

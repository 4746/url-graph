import { PluginSettingTab, Setting, type App } from 'obsidian';
import type UrlGraphPlugin from './main';
import { isLanguagePreference, locales } from './i18n/locales';
import { DEFAULT_SETTINGS } from './settings-data';
import { addFilterSettings } from './ui/filter-settings';
import { loadMetadataFilters, parseMetadataProperties } from './graph/metadata';

export { DEFAULT_SETTINGS, loadSettings, type UrlGraphSettings } from './settings-data';

// Keep the settings tab compatible with the declared minimum Obsidian version.
export class UrlGraphSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: UrlGraphPlugin) {
		super(app, plugin);
		plugin.register(plugin.i18n.subscribe(() => {
			if (this.containerEl.isConnected) this.display();
		}));
	}

	display(): void {
		const { i18n } = this.plugin;
		i18n.refresh();
		this.containerEl.empty();
		new Setting(this.containerEl)
			.setName(i18n.t('settings.language'))
			.setDesc(i18n.t('settings.languageDescription'))
			.addDropdown((dropdown) => {
				dropdown.addOption('auto', i18n.t('settings.languageAuto'));
				for (const [code, locale] of Object.entries(locales)) dropdown.addOption(code, locale.nativeName);
				dropdown.setValue(this.plugin.settings.language).onChange(async (value) => {
					if (!isLanguagePreference(value)) return;
					this.plugin.settings.language = value;
					await this.plugin.saveSettings();
				});
			});
		new Setting(this.containerEl)
			.setName(i18n.t('settings.urlProperty'))
			.setDesc(i18n.t('settings.urlPropertyDescription'))
			.addText((text) => text.setValue(this.plugin.settings.urlProperty)
				.onChange(async (value) => {
					this.plugin.settings.urlProperty = value.trim() || DEFAULT_SETTINGS.urlProperty;
					await this.plugin.saveSettings(true);
				}));
		new Setting(this.containerEl)
			.setName(i18n.t('settings.metadataProperties'))
			.setDesc(i18n.t('settings.metadataPropertiesDescription'))
			.addText((text) => text.setValue(this.plugin.settings.metadataProperties.join(', '))
				.onChange(async (value) => {
					const keys = parseMetadataProperties(value);
					if (JSON.stringify(keys) === JSON.stringify(this.plugin.settings.metadataProperties)) return;
					this.plugin.settings.metadataProperties = keys;
					this.plugin.settings.metadataFilters = loadMetadataFilters(this.plugin.settings.metadataFilters, keys);
					await this.plugin.saveSettings(true);
				}));
		addFilterSettings(this.containerEl, this.plugin);
	}
}

import { Setting } from 'obsidian';
import type UrlGraphPlugin from '../main';
import type { TranslationKey } from '../i18n/locales/en';
import type { UrlGraphSettings } from '../settings-data';

export function addGraphSettings(container: HTMLElement, plugin: UrlGraphPlugin): void {
	const t = (key: TranslationKey) => plugin.i18n.t(key);
	for (const [key, name, description] of [
		['showNodeTooltip', 'settings.showNodeTooltip', 'settings.showNodeTooltipDescription'],
		['groupBySize', 'settings.groupBySize', 'settings.groupBySizeDescription'],
		['showArrows', 'settings.showArrows', 'settings.showArrowsDescription'],
		['showIsolated', 'settings.showIsolated', 'settings.showIsolatedDescription'],
	] as const) {
		new Setting(container).setName(t(name)).setDesc(t(description)).addToggle((toggle) =>
			toggle.setValue(plugin.settings[key]).onChange(async (value) => {
				plugin.settings[key] = value;
				await plugin.saveSettings();
			}));
	}
	function dropdown<K extends 'labelVisibility' | 'nodeLabel' | 'colorMode' | 'nodeSizeMode'>(key: K, title: TranslationKey,
		options: Array<[UrlGraphSettings[K], TranslationKey]>): void {
		new Setting(container).setName(t(title)).addDropdown((input) => {
			for (const [value, label] of options) input.addOption(value, t(label));
			input.setValue(plugin.settings[key]).onChange(async (value) => {
				const selected = options.find(([id]) => id === value);
				if (!selected) return;
				plugin.settings[key] = selected[0];
				await plugin.saveSettings();
			});
		});
	}
	dropdown('labelVisibility', 'settings.labelVisibility', [
		['always', 'settings.labelsAlways'], ['hover', 'settings.labelsHover'], ['hidden', 'settings.labelsHidden'],
	]);
	dropdown('nodeLabel', 'settings.nodeLabel', [
		['name', 'settings.labelName'], ['path', 'settings.labelPath'], ['url', 'settings.labelUrl'],
	]);
	dropdown('nodeSizeMode', 'settings.nodeSizeMode', [
		['uniform', 'settings.sizeUniform'], ['outgoing', 'settings.sizeOutgoing'], ['incoming', 'settings.sizeIncoming'],
	]);
	container.createEl('p', { text: t('settings.nodeSizeDescription'), cls: 'url-graph-settings-description' });
	for (const [key, title, description, min, max, step] of [
		['nodeSpacing', 'settings.nodeSpacing', 'settings.nodeSpacingDescription', 40, 300, 10],
		['edgeWidth', 'settings.edgeWidth', null, 0.5, 5, 0.5],
		['edgeOpacity', 'settings.edgeOpacity', 'settings.edgeOpacityDescription', 0.1, 1, 0.05],
	] as const) {
		const setting = new Setting(container).setName(t(title));
		if (description) setting.setDesc(t(description));
		setting.addSlider((slider) => slider.setLimits(min, max, step).setValue(plugin.settings[key])
			.setDynamicTooltip().onChange(async (value) => {
				plugin.settings[key] = value;
				await plugin.saveSettings();
			}));
	}
	dropdown('colorMode', 'settings.colorMode', [
		['theme', 'settings.colorTheme'], ['custom', 'settings.colorCustom'],
		['domain', 'settings.colorDomain'], ['folder', 'settings.colorFolder'],
	]);
	new Setting(container).setName(t('settings.nodeColor')).setDesc(t('settings.nodeColorDescription'))
		.addColorPicker((picker) => picker.setValue(plugin.settings.nodeColor).onChange(async (value) => {
			plugin.settings.nodeColor = value;
			await plugin.saveSettings();
		}));
}

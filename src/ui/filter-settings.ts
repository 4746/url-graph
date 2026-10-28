import { Notice, Setting } from 'obsidian';
import type UrlGraphPlugin from '../main';
import { normalizeDomain, normalizeFolder } from '../graph/options';

export function addFilterSettings(container: HTMLElement, plugin: UrlGraphPlugin): void {
	const { i18n, settings } = plugin;
	new Setting(container).setName(i18n.t('settings.filters')).setDesc(i18n.t('settings.filtersDescription')).setHeading();
	const draft = {
		includeFolders: settings.includeFolders.join('\n'), excludeFolders: settings.excludeFolders.join('\n'),
		includeDomains: settings.includeDomains.join('\n'), excludeDomains: settings.excludeDomains.join('\n'),
	};
	const fields = [
		['includeFolders', 'settings.includeFolders', 'settings.foldersDescription'],
		['excludeFolders', 'settings.excludeFolders', 'settings.foldersDescription'],
		['includeDomains', 'settings.includeDomains', 'settings.domainsDescription'],
		['excludeDomains', 'settings.excludeDomains', 'settings.domainsDescription'],
	] as const;
	for (const [key, title, description] of fields) {
		new Setting(container).setName(i18n.t(title)).setDesc(i18n.t(description))
			.addTextArea((input) => input.setValue(draft[key]).onChange((value) => { draft[key] = value; }));
	}
	new Setting(container).addButton((button) => button.setButtonText(i18n.t('settings.applyFilters')).setCta()
		.onClick(async () => {
			const parsed = { includeFolders: [] as string[], excludeFolders: [] as string[], includeDomains: [] as string[], excludeDomains: [] as string[] };
			for (const [key] of fields) {
				const folders = key === 'includeFolders' || key === 'excludeFolders';
				const entries = draft[key].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
				const values = entries.map(folders ? normalizeFolder : normalizeDomain);
				if (values.some((value) => value === null)) {
					new Notice(i18n.t(folders ? 'notice.invalidFolders' : 'notice.invalidDomains'));
					return;
				}
				parsed[key] = [...new Set(values.filter((value): value is string => value !== null))];
			}
			Object.assign(settings, parsed);
			await plugin.saveSettings();
		}));
}

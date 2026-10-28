import { isLanguagePreference, type LanguagePreference } from './i18n/locales';
import { DEFAULT_GRAPH_OPTIONS, loadGraphOptions, type GraphOptions } from './graph/options';

export interface UrlGraphSettings extends GraphOptions {
	urlProperty: string;
	language: LanguagePreference;
	sidebarTabMigrationDone: boolean;
}

export const DEFAULT_SETTINGS: UrlGraphSettings = { ...DEFAULT_GRAPH_OPTIONS, urlProperty: 'url', language: 'auto', sidebarTabMigrationDone: false };

export function loadSettings(data: unknown): UrlGraphSettings {
	const saved = data && typeof data === 'object' ? data as Record<string, unknown> : {};
	return {
		...loadGraphOptions(saved),
		urlProperty: typeof saved.urlProperty === 'string' && saved.urlProperty.trim()
			? saved.urlProperty.trim() : DEFAULT_SETTINGS.urlProperty,
		language: isLanguagePreference(saved.language) ? saved.language : DEFAULT_SETTINGS.language,
		sidebarTabMigrationDone: saved.sidebarTabMigrationDone === true,
	};
}

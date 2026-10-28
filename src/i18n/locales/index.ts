import { en, type Dictionary } from './en';
import { uk } from './uk';

export interface LocaleDefinition {
	nativeName: string;
	translations: Partial<Dictionary>;
}

/** Add a dictionary and its registry entry here; the rest of the UI is automatic. */
export const locales = {
	en: { nativeName: 'English', translations: en },
	uk: { nativeName: 'Українська', translations: uk },
} satisfies Record<string, LocaleDefinition>;

export type LocaleCode = keyof typeof locales;
export type LanguagePreference = 'auto' | LocaleCode;

export function isLocaleCode(value: string): value is LocaleCode {
	return Object.prototype.hasOwnProperty.call(locales, value);
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
	return typeof value === 'string' && (value === 'auto' || isLocaleCode(value));
}

export function resolveLocale(value: string): LocaleCode {
	const normalized = value.trim().toLowerCase().replace(/_/g, '-');
	if (isLocaleCode(normalized)) return normalized;
	const base = normalized.split('-')[0] ?? '';
	return isLocaleCode(base) ? base : 'en';
}

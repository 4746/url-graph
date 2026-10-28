import { en, type Dictionary, type TranslationKey } from './locales/en';
import { locales, resolveLocale, type LanguagePreference, type LocaleCode } from './locales';

export type TranslationParams = Record<string, string | number>;

export function translate(dictionary: Partial<Dictionary>, key: TranslationKey, params: TranslationParams = {}): string {
	return (dictionary[key] ?? en[key]).replace(/\{(\w+)\}/g, (placeholder: string, name: string) =>
		Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder);
}

export class I18n {
	private listeners = new Set<() => void>();
	private preference: LanguagePreference;
	locale: LocaleCode;

	constructor(preference: LanguagePreference, private getAppLanguage: () => string) {
		this.preference = preference;
		this.locale = this.resolve();
	}

	t(key: TranslationKey, params?: TranslationParams): string {
		return translate(locales[this.locale].translations, key, params);
	}

	setLanguage(preference: LanguagePreference): void {
		this.preference = preference;
		this.refresh();
	}

	refresh(): void {
		const locale = this.resolve();
		if (locale === this.locale) return;
		this.locale = locale;
		for (const listener of this.listeners) listener();
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	private resolve(): LocaleCode {
		return resolveLocale(this.preference === 'auto' ? this.getAppLanguage() : this.preference);
	}
}

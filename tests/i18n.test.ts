import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Command, Plugin } from 'obsidian';
import { I18n, translate } from '../src/i18n';
import { en, type TranslationKey } from '../src/i18n/locales/en';
import { uk } from '../src/i18n/locales/uk';
import { isLanguagePreference, resolveLocale } from '../src/i18n/locales';
import { DEFAULT_SETTINGS, loadSettings } from '../src/settings-data';
import { registerControls } from '../src/ui/plugin-controls';

globalThis.window = globalThis as unknown as Window & typeof globalThis;

void test('automatic language resolves regional codes and falls back to English', () => {
	assert.equal(new I18n('auto', () => 'uk').locale, 'uk');
	for (const language of ['uk-UA', 'UK_ua', ' uk ']) assert.equal(resolveLocale(language), 'uk');
	for (const language of ['de', '', 'toString', '__proto__']) assert.equal(resolveLocale(language), 'en');
	assert.equal(new I18n('en', () => 'uk').locale, 'en');
	assert.equal(new I18n('uk', () => 'en').locale, 'uk');
});

void test('all initial translations and interpolation placeholders match the English base', () => {
	assert.deepEqual(Object.keys(uk).sort(), Object.keys(en).sort());
	for (const key of Object.keys(en) as TranslationKey[]) {
		assert.ok(uk[key].trim());
		assert.deepEqual(uk[key].match(/\{\w+\}/g), en[key].match(/\{\w+\}/g));
	}
	assert.equal(translate({}, 'graph.fit'), 'Fit graph');
	assert.equal(translate({ 'graph.fit': 'Test' }, 'graph.fit'), 'Test');
	assert.equal(translate({}, 'graph.stats', { notes: 0, links: 2 }), 'Notes: 0 · Links: 2');
	assert.equal(new I18n('uk', () => 'en').t('graph.errors', { errors: 5 }), ' · Не вдалося прочитати нотатки: 5');
});

void test('language changes notify live subscribers, auto mode refreshes, disposal removes listeners', () => {
	let appLanguage = 'en';
	const i18n = new I18n('auto', () => appLanguage);
	const observed: string[] = [];
	const unsubscribe = i18n.subscribe(() => observed.push(i18n.t('graph.fit')));
	i18n.setLanguage('uk');
	i18n.setLanguage('uk');
	appLanguage = 'uk';
	i18n.setLanguage('auto');
	appLanguage = 'de';
	i18n.refresh();
	assert.deepEqual(observed, ['Показати весь граф', 'Fit graph']);
	unsubscribe();
	i18n.setLanguage('uk');
	assert.equal(observed.length, 2);
});

void test('persisted settings migrate existing users to auto and validate language preferences', () => {
	assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
	assert.deepEqual(loadSettings({ urlProperty: ' canonical ' }), { ...DEFAULT_SETTINGS, urlProperty: 'canonical', language: 'auto' });
	assert.deepEqual(loadSettings({ urlProperty: '', language: 'uk' }), { ...DEFAULT_SETTINGS, urlProperty: 'url', language: 'uk' });
	assert.equal(loadSettings({ language: 'de' }).language, 'auto');
	assert.equal(loadSettings({ language: 123 }).language, 'auto');
	assert.equal(isLanguagePreference('toString'), false);
	assert.equal(isLanguagePreference('en'), true);
});

void test('commands and ribbon update without duplicate registrations and unsubscribe on unload', () => {
	const commands = new Map<string, Command>();
	const attributes = new Map<string, string>();
	const cleanup: Array<() => void> = [];
	const plugin = {
		addRibbonIcon: () => ({ setAttribute: (name: string, value: string) => attributes.set(name, value) }),
		addCommand: (command: Command) => {
			const registered = { ...command, id: `url-graph:${command.id}` };
			assert.equal(commands.has(registered.id), false);
			commands.set(registered.id, registered);
			return registered;
		},
		removeCommand: (id: string) => { commands.delete(id); },
		register: (callback: () => void) => { cleanup.push(callback); },
		registerDomEvent: () => {},
	} as unknown as Plugin;
	const i18n = new I18n('en', () => 'uk');
	registerControls(plugin, i18n, () => Promise.resolve(), () => {});
	assert.equal(commands.get('url-graph:open-graph')?.name, 'Open graph');
	i18n.setLanguage('uk');
	assert.equal(commands.size, 2);
	assert.equal(commands.get('url-graph:open-graph')?.name, 'Відкрити граф');
	assert.equal(commands.get('url-graph:rebuild-index')?.name, 'Перебудувати індекс URL');
	assert.equal(attributes.get('aria-label'), 'Відкрити URL-граф');
	cleanup.forEach((dispose) => dispose());
	i18n.setLanguage('en');
	assert.equal(commands.get('url-graph:open-graph')?.name, 'Відкрити граф');
});

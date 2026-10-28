import { Modal } from 'obsidian';
import type UrlGraphPlugin from '../main';
import { addGraphSettings } from './graph-settings';

export class GraphSettingsModal extends Modal {
	private unsubscribe: (() => void) | undefined;
	constructor(private plugin: UrlGraphPlugin) { super(plugin.app); }

	onOpen(): void {
		this.modalEl.addClass('url-graph-settings-modal');
		this.unsubscribe = this.plugin.i18n.subscribe(() => this.display());
		this.display();
	}

	private display(): void {
		this.setTitle(this.plugin.i18n.t('graph.settings'));
		this.contentEl.empty();
		addGraphSettings(this.contentEl, this.plugin);
	}

	onClose(): void {
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.contentEl.empty();
	}
}

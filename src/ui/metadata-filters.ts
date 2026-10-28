import { DropdownComponent } from 'obsidian';
import type { GraphSnapshot } from '../graph/types';
import type { I18n } from '../i18n';
import { metadataChoices } from './metadata-choices';

export class MetadataFilters {
	private container: HTMLElement;
	private properties = '';
	private rows: Array<{ property: string; dropdown: DropdownComponent; signature: string }> = [];

	constructor(parent: HTMLElement, private i18n: I18n, private onChange: (property: string, value: string) => void) {
		this.container = parent.createDiv({ cls: 'url-graph-metadata-filters' });
	}

	update(graph: GraphSnapshot, properties: readonly string[], selected: Record<string, string>): void {
		const signature = JSON.stringify(properties);
		if (this.properties !== signature) {
			this.properties = signature;
			this.container.empty();
			this.rows = properties.map((property) => {
				const label = this.container.createEl('label', { cls: 'url-graph-metadata-filter' });
				label.createSpan({ text: property });
				const dropdown = new DropdownComponent(label).onChange((value) => this.onChange(property, value));
				return { property, dropdown, signature: '' };
			});
		}
		for (const row of this.rows) {
			const value = Object.prototype.hasOwnProperty.call(selected, row.property) ? selected[row.property] ?? '' : '';
			const choices = metadataChoices(graph, row.property, value, this.i18n);
			const next = JSON.stringify([this.i18n.locale, value, choices]);
			if (next === row.signature) continue;
			row.signature = next;
			row.dropdown.selectEl.setAttribute('aria-label', this.i18n.t('graph.metadataFilter', { property: row.property }));
			row.dropdown.selectEl.empty();
			for (const [id, label] of choices) row.dropdown.addOption(id, label);
			row.dropdown.setValue(value);
		}
	}
}

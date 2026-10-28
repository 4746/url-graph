import { availableMetadataValues } from '../graph/metadata';
import type { GraphSnapshot } from '../graph/types';
import type { I18n } from '../i18n';

export function metadataChoices(graph: GraphSnapshot, property: string, selected: string, i18n: I18n): Array<[string, string]> {
	const values = availableMetadataValues(graph, property);
	const choices: Array<[string, string]> = [['', i18n.t('graph.allValues')], ...values.map((value): [string, string] => [value, value])];
	if (selected && !values.includes(selected)) choices.push([selected, i18n.t('graph.valueUnavailable', { value: selected })]);
	return choices;
}

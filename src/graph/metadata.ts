import type { GraphSnapshot } from './types';

export const DEFAULT_METADATA_PROPERTIES = ['language'];
export type MetadataValues = Record<string, string[]>;

export function parseMetadataProperties(value: unknown): string[] {
	const entries: unknown[] = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [];
	return [...new Set(entries.filter((entry): entry is string => typeof entry === 'string')
		.map((entry) => entry.trim()).filter(Boolean))];
}

function scalar(value: unknown): string | null {
	if (typeof value === 'string') return value.trim() || null;
	if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return String(value);
	return null;
}

export function readMetadata(properties: Record<string, unknown>, keys: readonly string[]): MetadataValues {
	return Object.fromEntries(keys.map((key) => {
		const value: unknown = Object.prototype.hasOwnProperty.call(properties, key) ? properties[key] : null;
		const values = [...new Set((Array.isArray(value) ? value : [value]).map(scalar)
			.filter((entry): entry is string => entry !== null))];
		return [key, values];
	}));
}

export function availableMetadataValues(graph: GraphSnapshot, property: string): string[] {
	const values = graph.nodes.flatMap((node) => node.metadata && Object.prototype.hasOwnProperty.call(node.metadata, property)
		? node.metadata[property] ?? [] : []);
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function loadMetadataFilters(value: unknown, keys: readonly string[]): Record<string, string> {
	const saved = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
	return Object.fromEntries(keys.flatMap((key) => {
		const entry: unknown = Object.prototype.hasOwnProperty.call(saved, key) ? saved[key] : null;
		return typeof entry === 'string' && entry.trim() ? [[key, entry.trim()]] : [];
	}));
}

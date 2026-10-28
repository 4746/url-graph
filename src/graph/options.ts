import { DEFAULT_METADATA_PROPERTIES, loadMetadataFilters, parseMetadataProperties } from './metadata';

export type LabelVisibility = 'always' | 'hover' | 'hidden';
export type NodeLabel = 'name' | 'path' | 'url';
export type ColorMode = 'theme' | 'custom' | 'domain' | 'folder';
export type NodeSizeMode = 'uniform' | 'outgoing' | 'incoming';

export interface GraphOptions {
	showIsolated: boolean;
	showArrows: boolean;
	showNodeTooltip: boolean;
	groupBySize: boolean;
	labelVisibility: LabelVisibility;
	nodeLabel: NodeLabel;
	nodeSpacing: number;
	edgeWidth: number;
	edgeOpacity: number;
	includeFolders: string[];
	excludeFolders: string[];
	includeDomains: string[];
	excludeDomains: string[];
	colorMode: ColorMode;
	nodeColor: string;
	nodeSizeMode: NodeSizeMode;
	metadataProperties: string[];
	metadataFilters: Record<string, string>;
}

export const DEFAULT_GRAPH_OPTIONS: GraphOptions = {
	showIsolated: true, showArrows: true, showNodeTooltip: true, groupBySize: true, labelVisibility: 'always', nodeLabel: 'name',
	nodeSpacing: 110, edgeWidth: 1.5, edgeOpacity: 0.7,
	includeFolders: [], excludeFolders: [], includeDomains: [], excludeDomains: [],
	colorMode: 'theme', nodeColor: '#7c6ee6',
	nodeSizeMode: 'uniform',
	metadataProperties: DEFAULT_METADATA_PROPERTIES, metadataFilters: {},
};

export function normalizeFolder(value: string): string | null {
	const path = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
	if (path === '/') return '/';
	const relative = path.replace(/^\/|\/$/g, '');
	return relative && !relative.split('/').some((part) => part === '.' || part === '..') ? relative : null;
}

export function normalizeDomain(value: string): string | null {
	try {
		const input = value.trim();
		if (!input || /[\s*]/.test(input)) return null;
		const url = new URL(input.includes('://') ? input : `https://${input}`);
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
			|| url.pathname !== '/' || url.search || url.hash) return null;
		return url.hostname.toLowerCase().replace(/\.$/, '');
	} catch { return null; }
}

function list(value: unknown, normalize: (value: string) => string | null): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.filter((entry): entry is string => typeof entry === 'string')
		.map(normalize).filter((entry): entry is string => entry !== null))];
}

function number(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
	return typeof value === 'string' && choices.includes(value as T) ? value as T : fallback;
}

export function loadGraphOptions(saved: Record<string, unknown>): GraphOptions {
	const defaults = DEFAULT_GRAPH_OPTIONS;
	const metadataProperties = saved.metadataProperties === undefined ? [...DEFAULT_METADATA_PROPERTIES] : parseMetadataProperties(saved.metadataProperties);
	const legacyFilters = typeof saved.filterLanguage === 'string' ? { language: saved.filterLanguage } : {};
	return {
		showNodeTooltip: typeof saved.showNodeTooltip === 'boolean' ? saved.showNodeTooltip : defaults.showNodeTooltip,
		groupBySize: typeof saved.groupBySize === 'boolean' ? saved.groupBySize : defaults.groupBySize,
		showArrows: typeof saved.showArrows === 'boolean' ? saved.showArrows : defaults.showArrows,
		showIsolated: typeof saved.showIsolated === 'boolean' ? saved.showIsolated : defaults.showIsolated,
		labelVisibility: choice(saved.labelVisibility, ['always', 'hover', 'hidden'], defaults.labelVisibility),
		nodeLabel: choice(saved.nodeLabel, ['name', 'path', 'url'], defaults.nodeLabel),
		nodeSpacing: number(saved.nodeSpacing, defaults.nodeSpacing, 40, 300),
		edgeWidth: number(saved.edgeWidth, defaults.edgeWidth, 0.5, 5),
		edgeOpacity: number(saved.edgeOpacity, defaults.edgeOpacity, 0.1, 1),
		includeFolders: list(saved.includeFolders, normalizeFolder), excludeFolders: list(saved.excludeFolders, normalizeFolder),
		includeDomains: list(saved.includeDomains, normalizeDomain), excludeDomains: list(saved.excludeDomains, normalizeDomain),
		colorMode: choice(saved.colorMode, ['theme', 'custom', 'domain', 'folder'], defaults.colorMode),
		nodeColor: typeof saved.nodeColor === 'string' && /^#[\da-f]{6}$/i.test(saved.nodeColor) ? saved.nodeColor : defaults.nodeColor,
		nodeSizeMode: choice(saved.nodeSizeMode, ['uniform', 'outgoing', 'incoming'], defaults.nodeSizeMode),
		metadataProperties,
		metadataFilters: loadMetadataFilters(saved.metadataFilters === undefined ? legacyFilters : saved.metadataFilters, metadataProperties),
	};
}

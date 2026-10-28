import { getFrontMatterInfo, parseYaml } from 'obsidian';
import { extractLinks } from '../graph/links';
import { normalizeUrl } from '../graph/url';
import type { NoteRecord } from '../graph/types';
import { DEFAULT_METADATA_PROPERTIES, readMetadata } from '../graph/metadata';

export function readNote(path: string, label: string, content: string, property: string,
	metadataProperties: readonly string[] = DEFAULT_METADATA_PROPERTIES): NoteRecord {
	const info = getFrontMatterInfo(content);
	const yaml: unknown = info.exists ? parseYaml(info.frontmatter) : null;
	const properties = yaml && typeof yaml === 'object' && !Array.isArray(yaml) ? yaml as Record<string, unknown> : {};
	const value: unknown = Object.prototype.hasOwnProperty.call(properties, property) ? properties[property] : null;
	const metadata = readMetadata(properties, metadataProperties);
	const url = normalizeUrl(value);
	return { path, label, url, metadata, links: url ? extractLinks(content.slice(info.contentStart)) : [] };
}

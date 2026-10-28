import { Component, TFile, type App } from 'obsidian';
import { buildGraphAsync } from '../graph/build';
import type { GraphSnapshot, NoteRecord } from '../graph/types';
import { readNote } from './read-note';
import { yieldToUI } from '../utils/yield';
import { DEFAULT_METADATA_PROPERTIES } from '../graph/metadata';

export interface IndexProgress {
	phase: 'idle' | 'reading' | 'linking' | 'error';
	completed: number;
	total: number;
}

/** Serial updates with bounded disk concurrency and per-file read caching. */
export class UrlIndexer extends Component {
	snapshot: GraphSnapshot = { nodes: [], edges: [], errors: 0 };
	ready = false;
	progress: IndexProgress = { phase: 'idle', completed: 0, total: 0 };
	private records = new Map<string, NoteRecord>();
	private failures = new Set<string>();
	private dirty = new Set<string>();
	private listeners = new Set<() => void>();
	private progressListeners = new Set<() => void>();
	private timer: number | undefined;
	private running = false;
	private pending = false;
	private full = true;
	private stopped = false;

	constructor(private app: App, private getProperty: () => string,
		private getMetadataProperties: () => readonly string[] = () => DEFAULT_METADATA_PROPERTIES) { super(); }

	onload(): void {
		this.registerEvent(this.app.vault.on('create', (file) => {
			if (file instanceof TFile && file.extension === 'md') this.queue(file.path);
		}));
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && file.extension === 'md') this.queue(file.path);
		}));
		this.registerEvent(this.app.vault.on('rename', () => this.rebuild()));
		this.registerEvent(this.app.vault.on('delete', () => this.queue()));
		this.app.workspace.onLayoutReady(() => {
			if (!this.stopped) this.rebuild();
		});
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	subscribeProgress(listener: () => void): () => void {
		this.progressListeners.add(listener);
		return () => { this.progressListeners.delete(listener); };
	}

	private setProgress(progress: IndexProgress): void {
		this.progress = progress;
		for (const listener of this.progressListeners) listener();
	}

	rebuild(): void {
		this.full = true;
		this.queue();
	}

	private queue(path?: string): void {
		if (this.stopped) return;
		if (path) this.dirty.add(path);
		this.pending = true;
		if (!this.running) this.setProgress({ phase: 'reading', completed: 0, total: 0 });
		if (this.timer !== undefined) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = undefined;
			void this.flush();
		}, 350);
	}

	private async flush(): Promise<void> {
		if (this.running || this.stopped) return;
		this.running = true;
		try {
			while (this.pending && !this.stopped) {
				this.pending = false;
				const full = this.full;
				this.full = false;
				const dirty = this.dirty;
				this.dirty = new Set();
				const property = this.getProperty();
				const metadataProperties = [...this.getMetadataProperties()];
				const files = this.app.vault.getMarkdownFiles();
				const paths = new Set(files.map((file) => file.path));
				for (const path of this.records.keys()) {
					if (!paths.has(path)) this.records.delete(path);
				}
				for (const path of this.failures) {
					if (!paths.has(path)) this.failures.delete(path);
				}
				const queue = files.filter((file) => full || dirty.has(file.path) || !this.records.has(file.path));
				this.setProgress({ phase: 'reading', completed: 0, total: queue.length });
				await yieldToUI(16);
				for (let next = 0; next < queue.length && !this.stopped; next += 8) {
					const batch = queue.slice(next, next + 8);
					await Promise.all(batch.map(async (file) => {
						const path = file.path;
						try {
							const content = await this.app.vault.cachedRead(file);
							if (this.stopped) return;
							this.records.set(path, readNote(path, file.basename, content, property, metadataProperties));
							this.failures.delete(path);
						} catch {
							if (this.stopped) return;
							this.records.delete(path);
							this.failures.add(path);
						}
					}));
					if (this.stopped) break;
					this.setProgress({ phase: 'reading', completed: Math.min(next + 8, queue.length), total: queue.length });
					await yieldToUI();
				}
				// Consume events/settings changed during reads before publishing.
				if (this.stopped || this.pending) continue;
				this.setProgress({ phase: 'linking', completed: queue.length, total: queue.length });
				await yieldToUI();
				const snapshot = await buildGraphAsync(this.records.values(), this.failures.size, () => this.stopped || this.pending);
				if (!snapshot || this.stopped || this.pending) continue;
				this.snapshot = snapshot;
				this.ready = true;
				for (const listener of this.listeners) listener();
			}
		} catch {
			if (!this.stopped) this.setProgress({ phase: 'error', completed: 0, total: 0 });
		} finally {
			this.running = false;
			if (!this.stopped && this.progress.phase !== 'error') this.setProgress({ phase: 'idle', completed: 0, total: 0 });
		}
	}

	onunload(): void {
		this.stopped = true;
		if (this.timer !== undefined) window.clearTimeout(this.timer);
		this.listeners.clear();
		this.progressListeners.clear();
		this.records.clear();
		this.failures.clear();
		this.dirty.clear();
	}
}

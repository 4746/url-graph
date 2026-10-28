import type { GraphOptions } from './options';

export class GraphPreferences {
	private listeners = new Set<() => void>();
	constructor(readonly get: () => GraphOptions) {}
	notify(): void { for (const listener of this.listeners) listener(); }
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}
}

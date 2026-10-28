import { parse } from 'yaml';

export class Component {
	private disposers: Array<() => void> = [];
	registerEvent(dispose: () => void): void { this.disposers.push(dispose); }
	load(): void { this.onload(); }
	unload(): void { this.onunload(); this.disposers.forEach((dispose) => dispose()); }
	onload(): void {}
	onunload(): void {}
}
// UI classes are placeholders for controller tests; no Obsidian DOM is simulated.
export class ItemView extends Component {
	getState(): Record<string, unknown> { return {}; }
	setState(): Promise<void> { return Promise.resolve(); }
}
export class DropdownComponent {}
export class Menu {}
export class Notice { constructor(public message: string) {} }
export class TFile {
	constructor(public path: string) {}
	get extension(): string { return this.path.split('.').pop() ?? ''; }
	get basename(): string { return this.path.split('/').pop()!.replace(/\.[^.]+$/, ''); }
}
export function parseYaml(value: string): unknown { return parse(value); }
export function setTooltip(element: HTMLElement, text: string): void { element.setAttribute('aria-label', text); }
export function setIcon(element: HTMLElement, icon: string): void { element.setAttribute('data-icon', icon); }
export function getFrontMatterInfo(content: string): { exists: boolean; frontmatter: string; contentStart: number } {
	const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
	return { exists: !!match, frontmatter: match?.[1] ?? '', contentStart: match?.[0].length ?? 0 };
}

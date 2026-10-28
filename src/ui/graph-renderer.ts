import type { Core } from 'cytoscape';
import type { GraphPreferences } from '../graph/preferences';
import { projectGraph, type DisplayGraph } from '../graph/project';
import type { GraphSnapshot } from '../graph/types';
import { yieldToUI } from '../utils/yield';
import { graphStyle } from './graph-style';
import { LayoutRunner } from './layout-runner';
import { syncGraphAsync } from './sync-graph';

export type RenderPhase = 'rendering' | 'layout' | null;

export class GraphRenderer {
	private revision = 0;
	private disposed = false;
	private serial = Promise.resolve();
	private lastGeometry = '';
	private needsLayout = false;

	constructor(private cy: Core, private canvas: HTMLElement, private preferences: GraphPreferences,
		private onPhase: (phase: RenderPhase) => void, private onGraph: (graph: DisplayGraph) => void,
		private onError: () => void,
		private layout: Pick<LayoutRunner, 'run' | 'cancel'> = new LayoutRunner()) {}

	request(snapshot: GraphSnapshot, forceLayout = false, fit = false): void {
		if (this.disposed) return;
		const revision = ++this.revision;
		this.layout.cancel();
		this.onPhase('rendering');
		const cancelled = () => this.disposed || revision !== this.revision;
		this.serial = this.serial.then(async () => {
			if (cancelled()) return;
			try {
				// Show the loader before projection, style calculation and element insertion.
				await yieldToUI(16);
				if (cancelled()) return;
				const options = this.preferences.get();
				const graph = projectGraph(snapshot, options);
				this.cy.style(graphStyle(this.canvas, options));
				const hadNodes = this.cy.nodes().length > 0;
				const changed = await syncGraphAsync(this.cy, graph, cancelled);
				if (changed === null || cancelled()) return;
				this.onGraph(graph);
				const geometry = JSON.stringify([options.nodeSpacing, options.groupBySize, options.nodeSizeMode,
					options.groupBySize && options.nodeSizeMode !== 'uniform' ? graph.nodes.map((node) => options.nodeSizeMode === 'incoming' ? node.incomingCount : node.outgoingCount) : false, graph.nodes.map((node) => node.nodeSize), options.labelVisibility === 'always'
					? graph.nodes.map((node) => node.displayLabel) : false]);
				this.needsLayout ||= forceLayout || changed || geometry !== this.lastGeometry;
				if (graph.nodes.length && this.needsLayout) {
					this.onPhase('layout');
					await yieldToUI(16);
					if (cancelled()) return;
					const complete = await this.layout.run(this.cy, options.nodeSpacing, options.labelVisibility === 'always', options.groupBySize ? options.nodeSizeMode : 'uniform');
					if (cancelled()) return;
					if (!complete) this.onError();
					else {
						this.needsLayout = false;
						this.lastGeometry = geometry;
						if (fit || !hadNodes) this.cy.fit(undefined, 45);
					}
				}
			} catch { if (!cancelled()) this.onError(); }
			finally { if (!cancelled()) this.onPhase(null); }
		});
	}

	pause(): void {
		this.revision++;
		this.layout.cancel();
		this.onPhase(null);
	}

	dispose(): void { this.disposed = true; this.pause(); }
}

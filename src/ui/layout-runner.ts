import type { NodeSizeMode } from '../graph/options';
import { sizeGroupedNodes } from '../graph/size-layout';
import type { Core, Layouts } from 'cytoscape';
import source from '../workers/layout-worker.ts?worker';
import type { LayoutRequest, LayoutResult } from '../workers/types';
import { separateOverlapsAsync } from '../graph/layout-geometry';
import { createLayoutRequest } from './layout-request';

export interface LayoutWorker {
	onmessage: ((event: MessageEvent<LayoutResult>) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
	postMessage(message: LayoutRequest): void;
	terminate(): void;
}

export function createLayoutWorker(): LayoutWorker {
	const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
	try { return new Worker(url); }
	finally { URL.revokeObjectURL(url); }
}

/** One calculation at a time. Cancelling terminates synchronous work in the worker. */
export class LayoutRunner {
	private cancelJob: (() => void) | undefined;
	constructor(private createWorker: () => LayoutWorker = createLayoutWorker) {}

	run(cy: Core, spacing: number, includeLabels = false, sizeMode: NodeSizeMode = 'uniform'): Promise<boolean> {
		this.cancel();
		const request = createLayoutRequest(cy, spacing, includeLabels, sizeMode);
		const effectiveSpacing = request.spacing;
		return new Promise((resolve) => {
			let worker: LayoutWorker | undefined;
			let fallback: Layouts | undefined;
			let settled = false;
			const finish = (complete: boolean) => {
				if (settled) return;
				settled = true;
				if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); }
				if (fallback) { fallback.removeAllListeners(); fallback.stop(); }
				this.cancelJob = undefined;
				resolve(complete);
			};
			this.cancelJob = () => finish(false);
			const useFallback = () => {
				if (settled) return;
				if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); worker = undefined; }
				if (request.groupBySize) {
					void separateOverlapsAsync(sizeGroupedNodes(request.nodes, effectiveSpacing), effectiveSpacing, () => settled || cy.destroyed())
						.then((positions) => {
							if (settled || !positions) return;
							cy.batch(() => positions.forEach((position) => cy.getElementById(position.id).position({ x: position.x, y: position.y })));
							finish(true);
						}).catch(() => finish(false));
					return;
				}
				try {
					// refresh:1 limits each animation frame to one simulation step.
					fallback = cy.layout({ name: 'cose', animate: true, refresh: 1, numIter: 400,
						fit: false, randomize: false, animationThreshold: 0,
						nodeRepulsion: () => 12000 * (effectiveSpacing / 110) ** 2,
						idealEdgeLength: () => effectiveSpacing, componentSpacing: effectiveSpacing * 1.4,
					});
					fallback.one('layoutstop', () => {
						void (async () => {
							try {
								const nodes = request.nodes.map((node) => ({ ...node, ...cy.getElementById(node.id).position() }));
								const positions = await separateOverlapsAsync(nodes, effectiveSpacing, () => settled || cy.destroyed());
								if (settled || !positions) return;
								cy.batch(() => positions.forEach((position) => cy.getElementById(position.id).position({ x: position.x, y: position.y })));
								finish(true);
							} catch { finish(false); }
						})();
					});
					fallback.run();
				} catch { finish(false); }
			};
			try {
				worker = this.createWorker();
				worker.onmessage = ({ data }) => {
					if (settled || cy.destroyed()) { finish(false); return; }
					cy.batch(() => {
						for (const position of data.positions) {
							if (Number.isFinite(position.x) && Number.isFinite(position.y)) {
								cy.getElementById(position.id).position({ x: position.x, y: position.y });
							}
						}
					});
					finish(true);
				};
				worker.onerror = () => useFallback();
				worker.postMessage(request);
			} catch { useFallback(); }
		});
	}

	cancel(): void { this.cancelJob?.(); }
}

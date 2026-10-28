import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Worker as NodeWorker } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';
import cytoscape, { type Core, type CoseLayoutOptions } from 'cytoscape';
import workerSource from '../src/workers/layout-worker.ts?worker';
import { LayoutRunner, type LayoutWorker } from '../src/ui/layout-runner';
import type { LayoutResult } from '../src/workers/types';
import { runCooperatively } from '../src/utils/cooperative';
import { buildGraph, buildGraphAsync } from '../src/graph/build';
import { syncGraphAsync } from '../src/ui/sync-graph';
import { DEFAULT_GRAPH_OPTIONS } from '../src/graph/options';
import { projectGraph } from '../src/graph/project';
import { loadingText } from '../src/ui/loading';
import { I18n } from '../src/i18n';
import { GraphRenderer, type RenderPhase } from '../src/ui/graph-renderer';
import { GraphPreferences } from '../src/graph/preferences';

function nativeWorker(): LayoutWorker {
	const worker = new NodeWorker('const {parentPort}=require("node:worker_threads");'
		+ 'globalThis.self={postMessage:data=>parentPort.postMessage(data)};'
		+ workerSource + ';parentPort.on("message",data=>self.onmessage({data}));', { eval: true });
	const endpoint: LayoutWorker = {
		onmessage: null, onerror: null,
		postMessage: (data) => worker.postMessage(data),
		terminate: () => { void worker.terminate(); },
	};
	worker.on('message', (data: LayoutResult) => endpoint.onmessage?.({ data } as MessageEvent<LayoutResult>));
	worker.on('error', () => endpoint.onerror?.({} as ErrorEvent));
	return endpoint;
}

void test('size grouping in worker and fallback places similar degrees in radial order without overlaps', async () => {
	const elements = Array.from({ length: 35 }, (_, index) => ({ data: {
		id: `n${index}`, incomingCount: 1000 - index * 20, outgoingCount: index,
	} }));
	for (const createWorker of [nativeWorker, () => { throw new Error('Worker unavailable'); }]) {
		const cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: 'preset' },
			style: [{ selector: 'node', style: { width: 64, height: 64 } }], elements });
		const runner = new LayoutRunner(createWorker);
		try {
			assert.equal(await runner.run(cy, 110, false, 'incoming'), true);
			const positions = cy.nodes().map((node) => node.position());
			const radii = positions.map((point) => Math.hypot(point.x, point.y));
			assert.equal(radii[0], 0, 'Largest count is at centre even when diameters are capped');
			for (let index = 1; index < radii.length; index++) assert.ok(radii[index]! + 0.001 >= radii[index - 1]!);
			for (let a = 0; a < positions.length; a++) {
				for (let b = a + 1; b < positions.length; b++) {
					assert.ok(Math.abs(positions[a]!.x - positions[b]!.x) >= 64 || Math.abs(positions[a]!.y - positions[b]!.y) >= 64);
				}
			}
			assert.equal(await runner.run(cy, 110, false, 'outgoing'), true);
			assert.deepEqual(cy.getElementById('n34').position(), { x: 0, y: 0 });
		} finally { runner.cancel(); cy.destroy(); }
	}
});

void test('real bundled worker lays out 295 nodes/2598 edges while main-thread timers continue', async () => {
	const nodes = Array.from({ length: 295 }, (_, i) => ({ data: { id: `n${i}` } }));
	const edges = Array.from({ length: 2598 }, (_, i) => ({
		data: { id: `e${i}`, source: `n${i % 295}`, target: `n${(i * 17 + 1) % 295}` },
	}));
	const cy = cytoscape({ headless: true, styleEnabled: true, style: [{ selector: 'node', style: { width: 160, height: 70 } }],
		layout: { name: 'preset' }, elements: [...nodes, ...edges] });
	const runner = new LayoutRunner(nativeWorker);
	let ticks = 0;
	const heartbeat = window.setInterval(() => { ticks++; }, 10);
	try {
		assert.equal(await runner.run(cy, 110), true);
		assert.ok(ticks > 0, 'UI timers must run before the layout finishes');
		assert.ok(cy.nodes().map((node) => Number.isFinite(node.position().x) && Number.isFinite(node.position().y)).every(Boolean));
		assert.ok(new Set(cy.nodes().map((node) => JSON.stringify(node.position()))).size > 1);
		const positions = cy.nodes().map((node) => node.position());
		for (let i = 0; i < positions.length; i++) {
			for (let j = i + 1; j < positions.length; j++) {
				assert.ok(Math.abs(positions[i]!.x - positions[j]!.x) >= 160
					|| Math.abs(positions[i]!.y - positions[j]!.y) >= 70, 'Worker must separate label-sized footprints');
			}
		}
	} finally { window.clearInterval(heartbeat); runner.cancel(); cy.destroy(); }
});

void test('cancelling a worker settles its promise and ignores late positions', async () => {
	let terminated = 0;
	const worker: LayoutWorker = { onmessage: null, onerror: null, postMessage: () => {}, terminate: () => { terminated++; } };
	const runner = new LayoutRunner(() => worker);
	const cy = cytoscape({ headless: true, layout: { name: 'preset' }, elements: [{ data: { id: 'a' } }] });
	try {
		const pending = runner.run(cy, 110);
		const late = worker.onmessage;
		runner.cancel();
		assert.equal(await pending, false);
		late?.({ data: { positions: [{ id: 'a', x: 999, y: 999 }] } } as MessageEvent<LayoutResult>);
		assert.equal(terminated, 1);
		assert.notEqual(cy.nodes()[0]!.position().x, 999);
	} finally { cy.destroy(); }
});

void test('worker failure uses frame-based CoSE fallback and cancellation stops it', async () => {
	let options: CoseLayoutOptions | undefined;
	let stopped = false;
	const fallback = { one: () => {}, run: () => {}, removeAllListeners: () => {}, stop: () => { stopped = true; } };
	const cy = { nodes: () => ({ map: () => [], length: 0 }), edges: () => ({ map: () => [], length: 0 }),
		layout: (value: CoseLayoutOptions) => { options = value; return fallback; } } as unknown as Core;
	const runner = new LayoutRunner(() => { throw new Error('Workers unavailable'); });
	const pending = runner.run(cy, 150);
	assert.equal(options?.animate, true);
	assert.equal(options?.refresh, 1);
	runner.cancel();
	assert.equal(await pending, false);
	assert.equal(stopped, true);
});

void test('cooperative CPU slices allow timers and stop cancelled work', async () => {
	let count = 0;
	function* steps(): Generator<void, number> {
		for (let i = 0; i < 20; i++) { count++; yield; }
		return count;
	}
	let timerRan = false;
	window.setTimeout(() => { timerRan = true; }, 0);
	assert.equal(await runCooperatively(steps(), () => false, 0), 20);
	assert.equal(timerRan, true);
	assert.equal(await runCooperatively(steps(), () => true), null);
	assert.equal(count, 20);
});

void test('async graph construction matches synchronous results and supports cancellation', async () => {
	const records = Array.from({ length: 50 }, (_, i) => ({ path: `${i}.md`, label: `${i}`,
		url: `https://example.com/${i}`, links: [`https://example.com/${(i + 1) % 50}`] }));
	assert.deepEqual(await buildGraphAsync(records, 0, () => false), buildGraph(records));
	assert.equal(await buildGraphAsync(records, 0, () => true), null);
	const cy = cytoscape({ headless: true });
	try {
		assert.equal(await syncGraphAsync(cy, projectGraph(buildGraph(records), DEFAULT_GRAPH_OPTIONS), () => true), null);
		assert.equal(cy.nodes().length, 0);
	} finally { cy.destroy(); }
	await delay(0);
});

void test('localized loading feedback covers scan, connection building, rendering and layout phases', () => {
	const i18n = new I18n('uk', () => 'en');
	assert.equal(loadingText(i18n, { phase: 'reading', completed: 8, total: 24 }, null), 'Читання нотаток: 8 / 24');
	assert.equal(loadingText(i18n, { phase: 'linking', completed: 24, total: 24 }, null), 'Побудова зв’язків за URL…');
	assert.equal(loadingText(i18n, { phase: 'idle', completed: 0, total: 0 }, 'layout'), 'Розташування вузлів…');
	assert.equal(loadingText(i18n, { phase: 'idle', completed: 0, total: 0 }, null), null);
});

void test('renderer announces loading before work, cancels outdated layouts and disposes cleanly', async () => {
	const canvas = { ownerDocument: { defaultView: { getComputedStyle: () => ({ getPropertyValue: () => '' }) } } } as unknown as HTMLElement;
	const cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: 'preset' } });
	const phases: RenderPhase[] = [];
	const workers: LayoutWorker[] = [];
	const layout = new LayoutRunner(() => {
		const worker: LayoutWorker = { onmessage: null, onerror: null, postMessage: () => {}, terminate: () => {} };
		workers.push(worker);
		return worker;
	});
	const renderer = new GraphRenderer(cy, canvas, new GraphPreferences(() => DEFAULT_GRAPH_OPTIONS),
		(phase) => { phases.push(phase); }, () => {}, () => assert.fail('Unexpected rendering error'), layout);
	const records = [
		{ path: 'a.md', label: 'a', url: 'https://example.com/a', links: ['https://example.com/b'] },
		{ path: 'b.md', label: 'b', url: 'https://example.com/b', links: [] },
	];
	const until = async (check: () => boolean) => {
		const deadline = Date.now() + 3000;
		while (!check()) { assert.ok(Date.now() < deadline, 'Renderer timed out'); await delay(5); }
	};
	try {
		renderer.request(buildGraph(records));
		assert.deepEqual(phases, ['rendering']);
		assert.equal(cy.nodes().length, 0, 'Rendering must wait for the loading indicator to paint');
		await until(() => workers.length === 1);
		const late = workers[0]!.onmessage;
		renderer.request(buildGraph(records.slice(0, 1)));
		await until(() => workers.length === 2);
		late?.({ data: { positions: [{ id: JSON.stringify(['note', 'a.md']), x: 999, y: 999 }] } } as MessageEvent<LayoutResult>);
		assert.notEqual(cy.nodes()[0]!.position().x, 999);
		workers[1]!.onmessage?.({ data: { positions: [{ id: cy.nodes()[0]!.id(), x: 20, y: 30 }] } } as MessageEvent<LayoutResult>);
		await until(() => phases[phases.length - 1] === null);
		assert.equal(cy.nodes().length, 1);
		assert.deepEqual(cy.nodes()[0]!.position(), { x: 20, y: 30 });
		renderer.request(buildGraph([{ ...records[0]!, label: 'A much longer permanent label' }]));
		await until(() => workers.length === 3);
		workers[2]!.onmessage?.({ data: { positions: [{ id: cy.nodes()[0]!.id(), x: 40, y: 50 }] } } as MessageEvent<LayoutResult>);
		await until(() => phases[phases.length - 1] === null);
		assert.deepEqual(cy.nodes()[0]!.position(), { x: 40, y: 50 });
		renderer.dispose();
		const previous = phases.length;
		renderer.request(buildGraph(records));
		await delay(30);
		assert.equal(phases.length, previous);
	} finally { renderer.dispose(); cy.destroy(); }
});

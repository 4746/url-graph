import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Core } from 'cytoscape';
import { adaptiveSpacing, layoutGap, separateOverlaps, separateOverlapsAsync, type LayoutNode } from '../src/graph/layout-geometry';
import { createLayoutRequest } from '../src/ui/layout-request';

void test('adaptive spacing increases with graph size/density and respects the base setting', () => {
	assert.ok(adaptiveSpacing(110, 295, 2598) <= Math.round(110 * 1.25));
	assert.ok(adaptiveSpacing(110, 295, 2598) > adaptiveSpacing(110, 5, 4));
	assert.ok(adaptiveSpacing(200, 295, 2598) > adaptiveSpacing(110, 295, 2598));
	assert.ok(Number.isFinite(adaptiveSpacing(110, 0, 0)));
});

void test('packing separates coincident circles and long-label footprints with a visible gap', () => {
	for (const count of [1, 80, 300]) {
		const nodes: LayoutNode[] = Array.from({ length: count }, (_, i) => ({
			id: `${i}`, x: 0, y: 0, width: i % 3 ? 160 : 22, height: i % 3 ? 70 : 22,
		}));
		const positions = separateOverlaps(nodes, 200);
		assert.equal(positions.length, count);
		for (let i = 0; i < count; i++) {
			assert.ok(Number.isFinite(positions[i]!.x) && Number.isFinite(positions[i]!.y));
			for (let j = i + 1; j < count; j++) {
				const width = (nodes[i]!.width! + nodes[j]!.width!) / 2 + layoutGap(200);
				const height = (nodes[i]!.height! + nodes[j]!.height!) / 2 + layoutGap(200);
				assert.ok(Math.abs(positions[i]!.x - positions[j]!.x) >= width - 0.001
					|| Math.abs(positions[i]!.y - positions[j]!.y) >= height - 0.001, `Overlapping nodes ${i}/${j}`);
			}
		}
	}
});

void test('packing preserves already-spaced positions and supports cancellable fallback processing', async () => {
	const nodes = [{ id: 'a', x: -500, y: 0 }, { id: 'b', x: 500, y: 0 }];
	assert.deepEqual(separateOverlaps(nodes, 200), nodes);
	assert.deepEqual(await separateOverlapsAsync(nodes, 200, () => false), nodes);
	assert.equal(await separateOverlapsAsync(nodes, 200, () => true), null);
	assert.deepEqual(separateOverlaps([], 200), []);
});

void test('layout request reserves measured permanent labels around their node center', () => {
	const node = { id: () => 'a', position: () => ({ x: 100, y: 100 }),
		boundingBox: (options: { includeLabels?: boolean }) => options.includeLabels
			? { x1: 20, x2: 180, y1: 89, y2: 140 } : { x1: 89, x2: 111, y1: 89, y2: 111 },
	};
	const cy = { nodes: () => ({ map: (fn: (value: typeof node) => unknown) => [fn(node)], length: 1 }),
		edges: () => ({ map: () => [], length: 0 }),
	} as unknown as Core;
	assert.equal(createLayoutRequest(cy, 110, true).nodes[0]!.width, 160);
	assert.equal(createLayoutRequest(cy, 110, true).nodes[0]!.height, 80);
	assert.equal(createLayoutRequest(cy, 110, false).nodes[0]!.width, 22);
	assert.equal(createLayoutRequest(cy, 110, false).nodes[0]!.height, 22);
});

import { runCooperatively } from '../utils/cooperative';

export interface LayoutNode { id: string; x: number; y: number; width?: number; height?: number; rank?: number }
export interface Position { id: string; x: number; y: number }
interface Box { left: number; right: number; top: number; bottom: number }

export function adaptiveSpacing(base: number, nodes: number, edges: number): number {
	const density = edges / Math.max(1, nodes);
	const scale = Math.min(1.25, 1 + Math.sqrt(Math.max(0, nodes)) / 140 + Math.min(0.1, density / 80));
	return Math.round(base * scale);
}

export function layoutGap(spacing: number): number {
	return Math.max(16, Math.min(28, spacing * 0.16));
}

function intersects(a: Box, b: Box): boolean {
	return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Retain the force layout's shape, placing overlapping footprints in nearby free cells. */
function* packingSteps(nodes: readonly LayoutNode[], spacing: number): Generator<void, Position[]> {
	const gap = layoutGap(spacing);
	const cellSize = Math.max(64, spacing);
	const step = Math.max(24, gap);
	const cells = new Map<string, number[]>();
	const boxes: Box[] = [];
	const positions: Position[] = [];
	let rightmost = -Infinity;
	const cellKeys = function* (box: Box): Generator<string> {
		for (let x = Math.floor(box.left / cellSize); x <= Math.floor(box.right / cellSize); x++) {
			for (let y = Math.floor(box.top / cellSize); y <= Math.floor(box.bottom / cellSize); y++) yield `${x}:${y}`;
		}
	};
	for (const node of nodes) {
		const halfWidth = (Math.max(22, node.width ?? 22) + gap) / 2;
		const halfHeight = (Math.max(22, node.height ?? 22) + gap) / 2;
		const originX = Number.isFinite(node.x) ? node.x : 0;
		const originY = Number.isFinite(node.y) ? node.y : 0;
		const boxAt = (x: number, y: number): Box => ({ left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight });
		const free = (box: Box) => {
			for (const key of cellKeys(box)) {
				for (const index of cells.get(key) ?? []) if (intersects(box, boxes[index]!)) return false;
			}
			return true;
		};
		let x = originX;
		let y = originY;
		let box = boxAt(x, y);
		if (!free(box)) {
			let found = false;
			for (let ring = 1; ring <= 24 && !found; ring++) {
				for (let dx = -ring; dx <= ring && !found; dx++) {
					for (const dy of [-ring, ring]) {
						const candidate = boxAt(originX + dx * step, originY + dy * step);
						if (free(candidate)) { x = originX + dx * step; y = originY + dy * step; box = candidate; found = true; break; }
						yield;
					}
				}
				for (let dy = -ring + 1; dy < ring && !found; dy++) {
					for (const dx of [-ring, ring]) {
						const candidate = boxAt(originX + dx * step, originY + dy * step);
						if (free(candidate)) { x = originX + dx * step; y = originY + dy * step; box = candidate; found = true; break; }
						yield;
					}
				}
			}
			// Bounded search with a guaranteed free placement for pathological dense inputs.
			if (!found) { x = rightmost + halfWidth + gap; box = boxAt(x, y); }
		}
		const index = boxes.length;
		boxes.push(box);
		for (const key of cellKeys(box)) {
			const occupants = cells.get(key) ?? [];
			occupants.push(index);
			cells.set(key, occupants);
		}
		rightmost = Math.max(rightmost, box.right);
		positions.push({ id: node.id, x, y });
		yield;
	}
	return positions;
}

export function separateOverlaps(nodes: readonly LayoutNode[], spacing: number): Position[] {
	const steps = packingSteps(nodes, spacing);
	let step = steps.next();
	while (!step.done) step = steps.next();
	return step.value;
}

export function separateOverlapsAsync(nodes: readonly LayoutNode[], spacing: number,
	cancelled: () => boolean): Promise<Position[] | null> {
	return runCooperatively(packingSteps(nodes, spacing), cancelled);
}

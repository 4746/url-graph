import { layoutGap, type LayoutNode } from './layout-geometry';

/** Descending degree gives a visible centre-to-edge gradient, including above the size cap. */
export function sizeGroupedNodes(nodes: readonly LayoutNode[], spacing: number): LayoutNode[] {
	const sorted = [...nodes].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0) || a.id.localeCompare(b.id));
	const step = nodes.reduce((max, node) => Math.max(max, Math.hypot(node.width ?? 22, node.height ?? 22) + layoutGap(spacing)), spacing);
	const result: LayoutNode[] = [];
	let index = 0;
	for (let ring = 0; index < sorted.length; ring++) {
		const radius = ring * step;
		const capacity = ring === 0 ? 1 : Math.max(1, Math.floor(Math.PI / Math.asin(1 / (2 * ring))));
		const count = Math.min(capacity, sorted.length - index);
		for (let slot = 0; slot < count; slot++) {
			const angle = slot * 2 * Math.PI / count + ring * 0.3;
			result.push({ ...sorted[index++]!, x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
		}
	}
	return result;
}

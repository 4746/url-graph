import type { Core } from 'cytoscape';
import type { DisplayGraph } from '../graph/project';
import { runCooperatively } from '../utils/cooperative';

/** Keep existing nodes (positions, selection, hover) when display options change. */
export function syncGraph(cy: Core, graph: DisplayGraph): boolean {
	cy.startBatch();
	try {
		const steps = syncSteps(cy, graph);
		let step = steps.next();
		while (!step.done) step = steps.next();
		return step.value;
	} finally { cy.endBatch(); }
}

export async function syncGraphAsync(cy: Core, graph: DisplayGraph, cancelled: () => boolean): Promise<boolean | null> {
	cy.startBatch();
	try { return await runCooperatively(syncSteps(cy, graph), cancelled); }
	finally { if (!cy.destroyed()) cy.endBatch(); }
}

function* syncSteps(cy: Core, graph: DisplayGraph): Generator<void, boolean> {
	const desired = new Set([...graph.nodes, ...graph.edges].map((element) => element.id));
	let topologyChanged = false;
	const removed = cy.elements().filter((element) => !desired.has(element.id()));
	if (removed.length) { removed.remove(); topologyChanged = true; }
	for (const node of graph.nodes) {
		const existing = cy.getElementById(node.id);
		if (existing.empty()) { cy.add({ data: { ...node } }); topologyChanged = true; }
		else existing.data({ ...node });
		yield;
	}
	for (const edge of graph.edges) {
		const existing = cy.getElementById(edge.id);
		if (existing.empty()) { cy.add({ data: { ...edge } }); topologyChanged = true; }
		else existing.data({ ...edge });
		yield;
	}
	return topologyChanged;
}

import type { GraphSnapshot, NoteRecord } from './types';
import { runCooperatively } from '../utils/cooperative';

export function buildGraph(records: Iterable<NoteRecord>, errors = 0): GraphSnapshot {
	const steps = buildSteps(records, errors);
	let step = steps.next();
	while (!step.done) step = steps.next();
	return step.value;
}

export function buildGraphAsync(records: Iterable<NoteRecord>, errors: number,
	cancelled: () => boolean): Promise<GraphSnapshot | null> {
	return runCooperatively(buildSteps(records, errors), cancelled);
}

function* buildSteps(records: Iterable<NoteRecord>, errors: number): Generator<void, GraphSnapshot> {
	const nodes: GraphSnapshot['nodes'] = [];
	const edges: GraphSnapshot['edges'] = [];
	const byUrl = new Map<string, string[]>();
	const indexed = [...records].filter((note) => note.url !== null);
	for (const note of indexed) {
		if (!note.url) continue;
		const id = JSON.stringify(['note', note.path]);
		nodes.push({ id, path: note.path, label: note.label, url: note.url, metadata: note.metadata });
		const targets = byUrl.get(note.url) ?? [];
		targets.push(id);
		byUrl.set(note.url, targets);
		yield;
	}
	for (const note of indexed) {
		const source = JSON.stringify(['note', note.path]);
		const targets = new Set<string>();
		for (const link of note.links) {
			for (const target of byUrl.get(link) ?? []) {
				if (target !== source) targets.add(target);
				yield;
			}
		}
		for (const target of targets) {
			edges.push({ id: JSON.stringify(['edge', source, target]), source, target });
			yield;
		}
	}
	return { nodes, edges, errors };
}

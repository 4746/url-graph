import { yieldToUI } from './yield';

/** Run bounded slices, with real event-loop yields rather than microtask-only awaits. */
export async function runCooperatively<T>(steps: Generator<void, T>, cancelled: () => boolean,
	budget = 8): Promise<T | null> {
	let start = performance.now();
	while (!cancelled()) {
		const step = steps.next();
		if (step.done) return step.value;
		if (performance.now() - start >= budget) {
			await yieldToUI();
			start = performance.now();
		}
	}
	steps.return(undefined as T);
	return null;
}

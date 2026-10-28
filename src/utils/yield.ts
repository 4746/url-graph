/** A macrotask boundary lets input events and browser painting run. */
export function yieldToUI(delay = 0): Promise<void> {
	return new Promise((resolve) => { window.setTimeout(resolve, delay); });
}

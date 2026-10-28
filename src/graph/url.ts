/** Canonical matching key only: never used to fetch a URL. */
export function normalizeUrl(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	try {
		const url = new URL(value.trim());
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		url.hash = '';
		url.pathname = url.pathname.replace(/\/+$/, '') || '/';
		return url.href;
	} catch { return null; }
}

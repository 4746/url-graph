import { Marked } from 'marked';
import { decodeHTML } from 'entities';
import { normalizeUrl } from './url';

const markdown = new Marked({ gfm: true });

/** Tokenize, never render HTML or execute embedded content. */
export function extractLinks(body: string): string[] {
	const links = new Set<string>();
	const tokens = markdown.lexer(body.replace(/%%[\s\S]*?%%/g, ''));
	void markdown.walkTokens(tokens, (token) => {
		// Image alt text can itself contain tokens that look like links.
		if (token.type === 'image') { token.tokens = []; return; }
		if (token.type !== 'link' || typeof token.href !== 'string') return;
		const url = normalizeUrl(decodeHTML(token.href));
		if (url) links.add(url);
	});
	return [...links];
}

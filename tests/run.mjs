import { build } from 'esbuild';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inlineWorkerPlugin } from '../build/inline-worker.mjs';

const directory = await mkdtemp(join(tmpdir(), 'url-graph-tests-'));
const outfile = join(directory, 'tests.cjs');
try {
await build({
	entryPoints: ['tests/index.test.ts'],
	bundle: true,
	plugins: [inlineWorkerPlugin()],
	platform: 'node',
	format: 'cjs',
	outfile,
	alias: { obsidian: './tests/obsidian.ts' },
});
await import(pathToFileURL(outfile).href);
} finally {
	await rm(outfile, { force: true });
	await rmdir(directory);
}

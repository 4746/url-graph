import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';

export function inlineWorkerPlugin() {
	return {
		name: 'inline-worker',
		setup(plugin) {
			plugin.onResolve({ filter: /\?worker$/ }, (args) => ({
				path: resolve(args.resolveDir, args.path.replace(/\?worker$/, '')),
				namespace: 'inline-worker',
			}));
			plugin.onLoad({ filter: /.*/, namespace: 'inline-worker' }, async (args) => {
				const result = await build({ entryPoints: [args.path], bundle: true, write: false,
					format: 'iife', platform: 'browser', target: 'es2021', minify: true, metafile: true });
				return { contents: result.outputFiles[0].text, loader: 'text', resolveDir: dirname(args.path),
					watchFiles: Object.keys(result.metafile.inputs).map((path) => resolve(path)) };
			});
		},
	};
}

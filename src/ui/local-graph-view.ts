import type { ViewStateResult } from 'obsidian';
import { localGraph, localRootPath } from '../graph/local-graph';
import type { GraphSnapshot } from '../graph/types';
import { UrlGraphView } from './graph-view';

export const URL_LOCAL_GRAPH_VIEW = 'url-graph-local-view';

export class LocalGraphView extends UrlGraphView {
	private rootPath: string | null = null;
	private cachedSource: GraphSnapshot | undefined;
	private cachedRoot: string | null = null;
	private cachedGraph: GraphSnapshot | undefined;
	getViewType(): string { return URL_LOCAL_GRAPH_VIEW; }
	getIcon(): string { return 'git-branch'; }
	getDisplayText(): string {
		return this.rootPath ? this.i18n.t('graph.localTitle', { note: this.rootPath.split('/').pop()?.replace(/\.md$/i, '') ?? this.rootPath })
			: this.i18n.t('graph.local');
	}
	protected getRootPath(): string | null { return this.rootPath; }
	protected graphSnapshot(): GraphSnapshot {
		if (!this.cachedGraph || this.cachedSource !== this.indexer.snapshot || this.cachedRoot !== this.rootPath) {
			this.cachedSource = this.indexer.snapshot;
			this.cachedRoot = this.rootPath;
			this.cachedGraph = localGraph(this.indexer.snapshot, this.rootPath);
		}
		return this.cachedGraph;
	}

	getState(): Record<string, unknown> { return { ...super.getState(), rootPath: this.rootPath }; }
	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.rootPath = localRootPath(state);
		await super.setState(state, result);
		this.renderGraph();
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (this.rootPath === oldPath || this.rootPath?.startsWith(`${oldPath}/`)) {
				this.rootPath = file.path + this.rootPath.slice(oldPath.length);
				this.app.workspace.requestSaveLayout();
				this.renderGraph();
			}
		}));
	}
}

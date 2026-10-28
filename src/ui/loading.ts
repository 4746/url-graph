import type { IndexProgress } from '../indexing/indexer';
import type { I18n } from '../i18n';
import type { RenderPhase } from './graph-renderer';

export function loadingText(i18n: I18n, progress: IndexProgress, phase: RenderPhase): string | null {
	if (progress.phase === 'reading') return progress.total
		? i18n.t('graph.readingProgress', { completed: progress.completed, total: progress.total })
		: i18n.t('graph.indexing');
	if (progress.phase === 'linking') return i18n.t('graph.linking');
	if (phase === 'rendering') return i18n.t('graph.rendering');
	if (phase === 'layout') return i18n.t('graph.layout');
	return null;
}

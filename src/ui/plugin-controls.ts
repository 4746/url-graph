import { setTooltip, type Command, type Plugin } from 'obsidian';
import type { I18n } from '../i18n';

export function registerControls(plugin: Plugin, i18n: I18n, openGraph: () => Promise<void>, rebuild: () => void,
	openConnections?: () => Promise<void>): void {
	const ribbon = plugin.addRibbonIcon('git-fork', i18n.t('graph.open'), () => { void openGraph(); });
	let commands: Command[] = [];
	const update = () => {
		setTooltip(ribbon, i18n.t('graph.open'), { placement: 'right' });
		for (const command of commands) plugin.removeCommand(command.id);
		commands = [
			plugin.addCommand({ id: 'open-graph', name: i18n.t('command.open'), callback: openGraph }),
			plugin.addCommand({ id: 'rebuild-index', name: i18n.t('command.rebuild'), callback: rebuild }),
			...(openConnections ? [plugin.addCommand({ id: 'open-connections', name: i18n.t('command.connections'), callback: openConnections })] : []),
		];
	};
	update();
	plugin.register(i18n.subscribe(update));
	plugin.registerDomEvent(window, 'focus', () => i18n.refresh());
}

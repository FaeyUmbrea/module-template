import groups from '../resources/av-data/index.ts';
import { getObsUtilsApi } from './obsUtils.ts';

export const AV_GROUPS = groups;

/** Register the curated picker options; other paths remain available through raw entry. */
export function registerAVData(): void {
	const groups = AV_GROUPS.map(group => ({
		...group,
		items: group.items.map(entry => ({ ...entry, label: game.i18n?.localize(entry.label) ?? entry.label })),
	}));
	getObsUtilsApi().setAVDataGrouped(groups);
}

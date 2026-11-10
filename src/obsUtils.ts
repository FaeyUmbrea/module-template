import type { ObsUtilsApi } from '@faeyumbrea/obs-utils-api-types';

export type ObsUtilsHostId = 'obs-utils' | 'obs-utils-premium';

const HOST_IDS: readonly ObsUtilsHostId[] = ['obs-utils', 'obs-utils-premium'];
const MINIMUM_VERSION = [5, 3, 0] as const;

interface HostModule {
	active?: boolean;
	version?: string;
	api?: ObsUtilsApi;
}

function supportedVersion(version: string | undefined): boolean {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:$|[-+])/.exec(version ?? '');
	if (!match) return false;
	const parts = match.slice(1, 4).map(Number);
	for (let index = 0; index < MINIMUM_VERSION.length; index++) {
		if (parts[index] !== MINIMUM_VERSION[index]) return parts[index]! > MINIMUM_VERSION[index];
	}
	return true;
}

/** Exactly one host owns the shared OBS Utils API and settings namespace. */
export function getObsUtilsHost(): { id: ObsUtilsHostId; api: ObsUtilsApi } {
	const modules = game.modules as Map<string, HostModule> | undefined;
	const active = HOST_IDS.filter(id => modules?.get(id)?.active === true);
	if (active.length !== 1) {
		throw new Error(active.length ? 'Enable only one OBS Utils host: standard or premium.' : 'Enable OBS Utils or OBS Utils Premium before this companion.');
	}
	const id = active[0]!;
	const module = modules!.get(id)!;
	const api = module.api;
	if (!supportedVersion(module.version) || !api || typeof api.setAVDataGrouped !== 'function' || typeof api.registerOverlayTrigger !== 'function') {
		throw new Error(`This companion requires ${id} 5.3.0 or newer with the released grouped actor-value and trigger API.`);
	}
	return { id, api };
}

export function getObsUtilsApi(): ObsUtilsApi {
	return getObsUtilsHost().api;
}

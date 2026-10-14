import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import license from 'rollup-plugin-license';

/** Creates the build plugin that writes bundled dependencies' original notices into dist. */
export function thirdPartyNotices(root = process.cwd()) {
	const manualPath = path.resolve(root, 'THIRD-PARTY-NOTICES.txt');
	const manualNotices = existsSync(manualPath) ? readFileSync(manualPath, 'utf8') : '';
	return {
		...license({
			cwd: root,
			thirdParty: {
				includePrivate: true,
				multipleVersions: true,
				output: {
					file: path.resolve(root, 'dist/THIRD-PARTY-NOTICES.txt'),
					template: dependencies => formatNotices(dependencies, manualNotices),
				},
			},
		}),
		apply: 'build',
	};
}

/** Formats the collected package notices in a stable order, rejecting missing licence declarations. */
function formatNotices(dependencies, manualNotices) {
	const sorted = [...dependencies].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
	for (const dependency of sorted) {
		if (!dependency.license) {
			throw new Error(`Missing licence declaration for bundled dependency ${dependency.name}@${dependency.version}`);
		}
	}
	return ['Third-party notices', ...sorted.map(dependency => dependency.text()), ...(manualNotices ? [manualNotices] : [])].join('\n\n---\n\n');
}

import { readFile } from 'node:fs/promises';
import { resolveResourceIndex } from '../load-resources.js';

/** Read a companion's indexed resource files for maintenance tools. */
export async function loadResources(folder) {
	if (!/^[\w-]+$/.test(folder)) throw new Error(`Invalid resource folder: ${folder}`);
	const base = new URL(`../resources/${folder}/`, import.meta.url);
	const index = JSON.parse(await readFile(new URL('index.json', base), 'utf8'));
	if (!Array.isArray(index)) throw new Error('Resource index must be an array.');
	// Validate names before resolving paths outside the resource folder.
	resolveResourceIndex(index, Object.fromEntries(index.map(name => [name, null])));
	const files = Object.fromEntries(await Promise.all(index.map(async name => [
		name,
		JSON.parse(await readFile(new URL(`${name}.json`, base), 'utf8')),
	])));
	return resolveResourceIndex(index, files);
}

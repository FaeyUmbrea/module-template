/** Resolve a resource index against imported files, preserving its order. */
export function resolveResourceIndex(index, files) {
	if (!Array.isArray(index) || index.some(name => typeof name !== 'string' || !/^[\w-]+$/.test(name))) {
		throw new Error('A resource index must list filenames without extensions.');
	}
	if (new Set(index).size !== index.length) throw new Error('Duplicate filename in resource index.');
	return index.map((name) => {
		if (!Object.hasOwn(files, name)) throw new Error(`Missing resource: ${name}`);
		return files[name];
	});
}

/* global game, copy */
// Paste this whole script into Foundry's browser console. It copies one JSON line.
(() => {
	/** Collect prepared field paths and scalar readouts without following recursive references. */
	const inspect = (value, path, fields, ancestors = new Set()) => {
		const isObject = value !== null && typeof value === 'object';
		const isCollection = Array.isArray(value) || value instanceof Set || value instanceof Map;
		if (path) {
			const field = { path, leaf: !isObject || isCollection };
			// Retain numeric and boolean readouts, including missing values, for diagnostics.
			// Text fields are represented by their paths; descriptions stay in Foundry.
			if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
				field.value = value;
			}
			fields.set(path, field);
		}
		if (!isObject || isCollection || ancestors.has(value)) return;
		const branch = new Set(ancestors).add(value);
		for (const [key, child] of Object.entries(value)) {
			inspect(child, path ? `${path}.${key}` : key, fields, branch);
		}
	};
	const actors = Array.from(game.actors ?? [], (actor) => {
		const fields = new Map();
		// toObject supplies document fields; system supplies the prepared values.
		const data = { ...actor.toObject(), system: actor.system };
		inspect(data, '', fields);
		return { type: actor.type, fields: [...fields.values()].sort((a, b) => a.path.localeCompare(b.path)) };
	});
	if (!actors.length) throw new Error('Create or import actors before extracting their fields.');
	copy(JSON.stringify({ format: 1, system: { id: game.system.id, version: game.system.version }, actors }));
	return `Copied field paths from ${actors.length} actors (${game.system.id} ${game.system.version}). Paste into yarn checkParity and press Enter.`;
})();

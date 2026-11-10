import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { loadResources } from './load-resources.js';

function print(message) {
	process.stdout.write(`${message}\n`);
}

export function checkParity(groups, sample, ignored = []) {
	if (sample?.format !== 1 || typeof sample.system?.id !== 'string' || !Array.isArray(sample.actors) || !sample.actors.length) {
		throw new Error('Paste the JSON copied by extract-data.js from a world containing actors.');
	}
	const observed = new Set();
	const leaves = new Set();
	const actorTypes = new Set();
	for (const actor of sample.actors) {
		if (typeof actor.type !== 'string' || !Array.isArray(actor.fields)) throw new Error('Invalid actor field sample.');
		actorTypes.add(actor.type);
		for (const field of actor.fields) {
			if (typeof field.path !== 'string' || typeof field.leaf !== 'boolean') throw new Error('Invalid field path in sample.');
			observed.add(field.path);
			if (field.leaf) leaves.add(field.path);
		}
	}
	const curated = new Set();
	for (const group of groups) {
		if (typeof group.label !== 'string' || !Array.isArray(group.items)) throw new Error('Invalid actor-value resource group.');
		for (const entry of group.items) {
			if (typeof entry.value !== 'string' || typeof entry.label !== 'string') throw new Error('Actor-value entries need value and label strings.');
			if (curated.has(entry.value)) throw new Error(`Duplicate curated path: ${entry.value}`);
			curated.add(entry.value);
		}
	}
	return {
		actorTypes: [...actorTypes].sort(),
		found: [...curated].filter(path => observed.has(path)).sort(),
		absent: [...curated].filter(path => !observed.has(path) && !ignored.includes(path)).sort(),
		uncurated: [...leaves].filter(path => !curated.has(path) && !ignored.includes(path)).sort(),
	};
}

/** Write beside the destination, then replace it so an interrupted write leaves valid JSON. */
export async function saveJson(file, value) {
	const temporary = new URL(`${file.pathname}.tmp`, file);
	await mkdir(new URL('.', file), { recursive: true });
	await writeFile(temporary, `${JSON.stringify(value, null, '\t')}\n`);
	await rename(temporary, file);
}

async function readOptionalJson(file, fallback) {
	try {
		return JSON.parse(await readFile(file, 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') return fallback;
		throw error;
	}
}

function findEntry(groups, path) {
	for (const group of groups) {
		const entry = group.items.find(item => item.value === path);
		if (entry) return { group, entry };
	}
	throw new Error(`No curated entry for ${path}.`);
}

/** Change a curated path without discarding its label or group. */
export function replacePath(groups, previous, replacement, sample) {
	const observed = sample.actors.some(actor => actor.fields.some(field => field.path === replacement));
	if (!observed) throw new Error(`The extraction does not contain ${replacement}.`);
	if (groups.some(group => group.items.some(entry => entry.value === replacement))) {
		throw new Error(`Already curated: ${replacement}`);
	}
	findEntry(groups, previous).entry.value = replacement;
}

/** Insert a language key without replacing an existing translation or nested object. */
export function addLanguageKey(language, key, text) {
	const parts = key.split('.');
	if (parts.some(part => !part || ['__proto__', 'constructor', 'prototype'].includes(part))) {
		throw new Error('Use a non-empty language key with dot-separated names.');
	}
	let parent = language;
	for (const part of parts.slice(0, -1)) {
		if (Object.hasOwn(parent, part) && (typeof parent[part] !== 'object' || parent[part] === null || Array.isArray(parent[part]))) {
			throw new Error(`Language key conflicts with ${part}.`);
		}
		parent[part] ??= {};
		parent = parent[part];
	}
	const final = parts.at(-1);
	if (Object.hasOwn(parent, final)) {
		if (parent[final] !== text) throw new Error(`Language key already exists: ${key}`);
		return;
	}
	if (!text.trim()) throw new Error('Enter the label text.');
	parent[final] = text;
}

export function compareExtractions(previous, current) {
	const currentPaths = new Set(current.actors.flatMap(actor => actor.fields.map(field => field.path)));
	return [...new Set(previous?.actors.flatMap(actor => actor.fields.map(field => field.path)) ?? [])]
		.filter(path => !currentPaths.has(path))
		.sort();
}

function printReport(groups, sample, ignored) {
	const report = checkParity(groups, sample, ignored);
	const total = report.found.length + report.absent.length;
	print(`\n${sample.system.id} ${sample.system.version}: ${sample.actors.length} actors; types: ${report.actorTypes.join(', ')}`);
	print(`Curated paths found: ${report.found.length}/${total}${total ? ` (${Math.round(report.found.length / total * 100)}%)` : ''}`);
	for (const [heading, paths] of [
		['Curated paths absent from this sample — review for stale or optional fields', report.absent],
		['Uncurated fields — candidates for review', report.uncurated],
	]) {
		print(`\n${heading} (${paths.length}):`);
		for (const path of paths) print(`  ${path}`);
	}
	if (sample.absentSincePrevious) {
		print(`\nAll paths present in the previous extraction but absent now (${sample.absentSincePrevious.length}):`);
		sample.absentSincePrevious.forEach(path => print(`  ${path}`));
	}
	print('\nAbsence only describes these actors, not every possible actor in the system.');
	return report;
}

function copyExtractor(script) {
	const command = process.platform === 'darwin'
		? ['pbcopy', []]
		: process.platform === 'win32'
			? ['clip', []]
			: process.env.WAYLAND_DISPLAY ? ['wl-copy', []] : ['xclip', ['-selection', 'clipboard']];
	const result = spawnSync(command[0], command[1], { input: script, encoding: 'utf8' });
	if (result.error || result.status !== 0) {
		throw new Error(`Clipboard unavailable (${command[0]}). Copy extract-data.js manually.`);
	}
	print('Extractor copied. Paste it into the Foundry console, then paste its result here.');
}

async function main() {
	const root = new URL('../', import.meta.url);
	const groups = await loadResources('av-data');
	const index = JSON.parse(await readFile(new URL('resources/av-data/index.json', root), 'utf8'));
	const manifest = JSON.parse(await readFile(new URL('module.json', root), 'utf8'));
	const supportedSystems = manifest.relationships?.systems?.map(system => system.id) ?? [];
	const ignoreFile = new URL('ignore.json', root);
	const sampleFile = new URL('.parity/latest.json', root);
	const ignored = await readOptionalJson(ignoreFile, []);
	if (!Array.isArray(ignored) || ignored.some(path => typeof path !== 'string')) {
		throw new Error('ignore.json must be an array of field paths.');
	}
	let sample = await readOptionalJson(sampleFile, null);
	const removedFile = new URL('.parity/removed.json', root);
	const removed = await readOptionalJson(removedFile, []);
	const terminal = createInterface({ input: process.stdin, output: process.stdout });
	const ask = async prompt => (await terminal.question(prompt)).trim();
	const validateSample = (value) => {
		checkParity(groups, value);
		if (supportedSystems.length && !supportedSystems.includes(value.system.id)) {
			throw new Error(`This module targets ${supportedSystems.join(', ')}; the sample is ${value.system.id}.`);
		}
	};
	const persistGroups = async () => {
		for (let position = 0; position < groups.length; position++) {
			await saveJson(new URL(`resources/av-data/${index[position]}.json`, root), groups[position]);
		}
	};
	const reviewIgnoreList = async () => {
		print(`\nIgnored fields (${ignored.length}):`);
		ignored.forEach(path => print(`  ${path}`));
		const path = await ask('Path to stop ignoring (Enter to return) > ');
		if (!path) return;
		const position = ignored.indexOf(path);
		if (position < 0) throw new Error(`Not ignored: ${path}`);
		ignored.splice(position, 1);
		await saveJson(ignoreFile, ignored);
	};
	try {
		// Piped input remains useful for quick reports and automated checks.
		if (!process.stdin.isTTY) {
			const value = JSON.parse(await ask('Actor data > '));
			validateSample(value);
			printReport(groups, value, ignored);
			return;
		}
		while (true) {
			print('\n[c] Copy extractor  [p] Paste extraction  [r] Review saved extraction  [i] Review ignored fields  [d] Show removed fields  [q] Quit');
			if (sample) print(`Saved extraction: ${sample.system.id} ${sample.system.version} (${sample.actors.length} actors), captured ${sample.capturedAt ?? 'before timestamp tracking'}.`);
			const action = await ask('Choose > ');
			if (action === 'q') break;
			try {
				if (action === 'c') {
					copyExtractor(await readFile(new URL('extract-data.js', root), 'utf8'));
					continue;
				}
				if (action === 'd') {
					print(`All removed fields (${removed.length}):`);
					removed.forEach(item => print(`  ${item.path} — ${item.label} (${item.group})`));
					continue;
				}
				if (action === 'i') {
					await reviewIgnoreList();
					continue;
				}
				if (action === 'p') {
					const value = JSON.parse(await ask('Actor data > '));
					validateSample(value);
					const extraction = { ...value, capturedAt: new Date().toISOString(), absentSincePrevious: compareExtractions(sample, value) };
					await saveJson(sampleFile, extraction);
					sample = extraction;
				} else if (action !== 'r') {
					continue;
				}
				if (!sample) throw new Error('Paste an extraction first.');
				validateSample(sample);
				while (true) {
					const report = printReport(groups, sample, ignored);
					print('\n[x] Replace stale path  [d] Remove curated field  [a] Add field  [i] Ignore field  [b] Back');
					const edit = await ask('Review > ');
					if (edit === 'b') break;
					const path = await ask('Field path > ');
					if (edit === 'x') {
						if (!report.absent.includes(path)) throw new Error('Choose a path from the absent list.');
						replacePath(groups, path, await ask('Replacement path > '), sample);
						await persistGroups();
					} else if (edit === 'd') {
						const { group, entry } = findEntry(groups, path);
						if (await ask(`Remove ${path} (${entry.label})? [y/N] > `) !== 'y') continue;
						group.items.splice(group.items.indexOf(entry), 1);
						await persistGroups();
						removed.push({ path, label: entry.label, group: group.label });
						await saveJson(removedFile, removed);
						print('\nAll removed fields (including earlier reviews):');
						removed.forEach(item => print(`  ${item.path} — ${item.label} (${item.group})`));
					} else if (edit === 'i') {
						if (!report.absent.includes(path) && !report.uncurated.includes(path)) throw new Error('Choose a field from the report.');
						if (!ignored.includes(path)) ignored.push(path);
						await saveJson(ignoreFile, ignored.sort());
					} else if (edit === 'a') {
						if (!report.uncurated.includes(path)) throw new Error('Choose a path from the uncurated list.');
						groups.forEach((group, position) => print(`  ${position + 1}: ${group.label} (${index[position]}.json)`));
						const group = groups[Number(await ask('Group number > ')) - 1];
						if (!group) throw new Error('Choose an existing group number.');
						const key = await ask(`Language key (${manifest.id}.labels.… ) > `);
						if (!key.startsWith(`${manifest.id}.labels.`)) throw new Error(`Use a key under ${manifest.id}.labels.`);
						const languages = [];
						for (const locale of manifest.languages ?? [{ lang: 'en', path: 'lang/en.json' }]) {
							const code = locale.lang;
							if (!/^(?:en|de)(?:[-_][A-Za-z]+)?$/.test(code)) continue;
							if (!/^lang\/[\w-]+\.json$/.test(locale.path)) throw new Error('Language files must be JSON files in lang/.');
							const file = new URL(locale.path, root);
							const language = await readOptionalJson(file, null);
							if (!language) continue;
							addLanguageKey(language, key, await ask(`${code.toUpperCase()} label > `));
							languages.push({ file, language });
						}
						if (!languages.length) throw new Error('No English or German language file found.');
						for (const { file, language } of languages) await saveJson(file, language);
						group.items.push({ value: path, label: key });
						await persistGroups();
					}
				}
			} catch (error) {
				print(error.message);
			}
		}
	} finally {
		terminal.close();
		process.stdin.pause();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}

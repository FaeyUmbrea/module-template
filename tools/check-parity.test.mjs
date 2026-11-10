import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { addLanguageKey, checkParity, compareExtractions, replacePath, saveJson } from './check-parity.js';

const groups = [{ label: 'Combat', items: [
	{ value: 'name', label: 'Name' },
	{ value: 'system.hp.value', label: 'HP' },
	{ value: 'system.focus.value', label: 'Focus' },
] }];
const sample = { format: 1, system: { id: 'pf2e', version: '8.1.2' }, actors: [
	{ type: 'character', fields: [{ path: 'name', leaf: true }, { path: 'system.hp.value', leaf: true }, { path: 'system.ac.value', leaf: true }] },
	{ type: 'npc', fields: [{ path: 'system.hp.value', leaf: true }] },
] };

test('separates absent curated paths from uncurated fields across actor types', () => {
	assert.deepEqual(checkParity(groups, sample), {
		actorTypes: ['character', 'npc'],
		found: ['name', 'system.hp.value'],
		absent: ['system.focus.value'],
		uncurated: ['system.ac.value'],
	});
});

test('rejects incomplete samples and duplicate resource paths', () => {
	assert.throws(() => checkParity(groups, { ...sample, actors: [] }), /containing actors/);
	assert.throws(() => checkParity([...groups, ...groups], sample), /Duplicate curated path/);
	assert.throws(() => checkParity(groups, { ...sample, actors: [{ type: 'character', fields: [{}] }] }), /Invalid field path/);
});

test('console extractor captures prepared fields and avoids recursive document references', async () => {
	const system = { hp: { value: 20 }, ac: { value: 16 }, san: { value: null }, dead: false, traits: ['human'], secret: 'not filtered' };
	system.cycle = system;
	let copied;
	const actor = { type: 'character', system, toObject: () => ({ name: 'Hero', type: 'character', system: { hp: { value: 10 } } }) };
	vm.runInNewContext(await readFile(new URL('../extract-data.js', import.meta.url), 'utf8'), {
		game: { actors: [actor], system: sample.system },
		copy(value) { copied = JSON.parse(value); },
		console: { info() {} },
	});
	const fields = copied.actors[0].fields;
	assert.ok(fields.some(field => field.path === 'system.ac.value' && field.leaf));
	assert.ok(fields.some(field => field.path === 'system.secret' && field.leaf));
	assert.ok(fields.some(field => field.path === 'system.traits' && field.leaf));
	assert.ok(!fields.some(field => field.path.startsWith('system.traits.')));
	assert.ok(fields.length < 20);
	assert.equal(fields.find(field => field.path === 'system.hp.value').value, 20);
	assert.equal(fields.find(field => field.path === 'system.san.value').value, null);
	assert.equal(fields.find(field => field.path === 'system.dead').value, false);
	assert.ok(!Object.hasOwn(fields.find(field => field.path === 'system.secret'), 'value'));
	assert.equal(copied.system.version, '8.1.2');
});

test('CLI accepts a pasted extractor line and reports against the actual resources', async () => {
	const manifest = JSON.parse(await readFile(new URL('../module.json', import.meta.url), 'utf8'));
	const input = { ...sample, system: { ...sample.system, id: manifest.relationships?.systems?.[0]?.id ?? 'pf2e' } };
	const result = spawnSync(process.execPath, ['tools/check-parity.js'], {
		cwd: new URL('../', import.meta.url),
		input: `${JSON.stringify(input)}\n`,
		encoding: 'utf8',
	});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Curated paths found:/);
	assert.match(result.stdout, /Uncurated fields/);
	assert.match(result.stdout, /Absence only describes these actors/);
});

test('ignoring suppresses review candidates without removing curated resources', () => {
	const report = checkParity(groups, sample, ['system.focus.value', 'system.ac.value']);
	assert.deepEqual(report.absent, []);
	assert.deepEqual(report.uncurated, []);
	assert.equal(groups[0].items.length, 3);
});

test('path correction preserves labels and rejects absent or duplicate replacements', () => {
	const edited = structuredClone(groups);
	assert.throws(() => replacePath(edited, 'system.focus.value', 'name', sample), /Already curated/);
	assert.throws(() => replacePath(edited, 'system.focus.value', 'missing', sample), /does not contain/);
	replacePath(edited, 'system.focus.value', 'system.ac.value', sample);
	assert.deepEqual(edited[0].items[2], { value: 'system.ac.value', label: 'Focus' });
	assert.deepEqual(checkParity(edited, sample).absent, []);
});

test('language additions preserve existing content and reject conflicting or unsafe keys', () => {
	const language = { companion: { labels: { hp: 'HP' } } };
	addLanguageKey(language, 'companion.labels.ac', 'Armor Class');
	assert.deepEqual(language, { companion: { labels: { hp: 'HP', ac: 'Armor Class' } } });
	assert.throws(() => addLanguageKey(language, 'companion.labels.hp', 'Changed'), /already exists/);
	assert.throws(() => addLanguageKey(language, 'companion.labels.hp.value', 'Wrong'), /conflicts/);
	assert.throws(() => addLanguageKey(language, '__proto__.polluted', 'Wrong'), /language key/);
	assert.throws(() => addLanguageKey(language, 'companion.labels.blank', ' '), /label text/);
});

test('saved extraction can be read back after an atomic replacement', async () => {
	const folder = await mkdtemp(join(tmpdir(), 'companion-parity-'));
	try {
		const file = pathToFileURL(join(folder, '.parity/latest.json'));
		await saveJson(file, sample);
		assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), sample);
		await saveJson(file, { ...sample, capturedAt: '2026-10-12T00:00:00Z' });
		assert.equal(JSON.parse(await readFile(file, 'utf8')).capturedAt, '2026-10-12T00:00:00Z');
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});

test('prints removed extraction paths even when they were never curated', () => {
	const previous = { ...sample, actors: [{ type: 'character', fields: [{ path: 'old.uncurated', leaf: true }, { path: 'name', leaf: true }] }] };
	assert.deepEqual(compareExtractions(previous, sample), ['old.uncurated']);
	assert.deepEqual(compareExtractions(null, sample), []);
});

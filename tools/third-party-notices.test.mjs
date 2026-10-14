import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { afterEach, beforeEach, it } from 'vitest';
import { thirdPartyNotices } from './third-party-notices.mjs';

let root;
beforeEach(async () => {
	root = await mkdtemp(path.resolve('.notices-test-'));
	await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'test-module', version: '1.0.0', type: 'module' }));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

/** Installs a small fixture dependency with its original licence and optional NOTICE. */
async function addPackage(name, licence, notice = '') {
	const directory = path.join(root, 'node_modules', name);
	await mkdir(directory, { recursive: true });
	await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', license: licence }));
	await writeFile(path.join(directory, 'index.js'), 'export const value = 42;');
	await writeFile(path.join(directory, 'LICENSE'), `Original licence text for ${name}`);
	if (notice)
		await writeFile(path.join(directory, 'NOTICE'), notice);
}

/** Builds the fixture through Vite and reads the generated distribution notice. */
async function buildNotices(source, external = []) {
	await writeFile(path.join(root, 'index.js'), source);
	await build({
		configFile: false,
		root,
		logLevel: 'silent',
		plugins: [thirdPartyNotices(root)],
		build: {
			outDir: 'dist',
			sourcemap: true,
			lib: { entry: path.join(root, 'index.js'), formats: ['es'], fileName: 'module' },
			rollupOptions: { external },
		},
	});
	return readFile(path.join(root, 'dist/THIRD-PARTY-NOTICES.txt'), 'utf8');
}

it('preserves bundled licence and NOTICE text, excluding unused and external packages', async () => {
	await addPackage('bundled-dependency', 'MIT', 'Original attribution notice');
	await addPackage('unused-dependency', 'BSD-3-Clause');
	await addPackage('external-dependency', 'MIT');
	const notices = await buildNotices('export { value } from \'bundled-dependency\'; export { value as external } from \'external-dependency\';', ['external-dependency']);
	assert.match(notices, /bundled-dependency/);
	assert.match(notices, /Original licence text for bundled-dependency/);
	assert.match(notices, /Original attribution notice/);
	assert.doesNotMatch(notices, /unused-dependency|external-dependency/);
});

it('rejects a bundled package without a licence declaration', async () => {
	await addPackage('undeclared-dependency', undefined);
	await assert.rejects(buildNotices('export { value } from \'undeclared-dependency\';'), /Missing licence declaration.*undeclared-dependency/);
});

it('creates a notice file for a module without bundled dependencies', async () => {
	assert.match(await buildNotices('export const value = 42;'), /^Third-party notices/);
});

it('excludes an imported package removed by tree shaking', async () => {
	await addPackage('tree-shaken-dependency', 'MIT');
	const notices = await buildNotices('import { value } from \'tree-shaken-dependency\'; export const other = 7;');
	assert.doesNotMatch(notices, /tree-shaken-dependency/);
});

it('includes the maintained notices for copied source and assets', async () => {
	await writeFile(path.join(root, 'THIRD-PARTY-NOTICES.txt'), 'Original copied-source notice');
	assert.match(await buildNotices('export const value = 42;'), /Original copied-source notice/);
});

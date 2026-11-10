import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it, onTestFinished } from 'vitest';
import { packageModule } from './package-module.mjs';

it('packages protected distribution files without changing source metadata or including development files', async () => {
	const directory = await mkdtemp(path.join(tmpdir(), 'module-package-'));
	onTestFinished(() => rm(directory, { recursive: true, force: true }));
	const manifest = { id: 'test-module', title: 'Test', version: '1.2.3', download: 'https://example.com/old.zip' };
	await writeFile(path.join(directory, 'module.json'), JSON.stringify(manifest));
	await writeFile(path.join(directory, 'LICENSE'), 'Original licence');
	for (const name of ['dist', 'src', 'node_modules', 'lang', 'packs']) await mkdir(path.join(directory, name));
	for (const name of ['dist/module.js', 'dist/THIRD-PARTY-NOTICES.txt', 'src/private.ts', 'node_modules/private.js', 'lang/en.json', 'packs/preset.json']) {
		await writeFile(path.join(directory, name), name);
	}
	await writeFile(path.join(directory, 'dist/.DS_Store'), 'Finder metadata');
	const archive = await packageModule(directory, 'protected');
	const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' });
	assert.match(entries, /dist\/module\.js/);
	assert.match(entries, /dist\/THIRD-PARTY-NOTICES\.txt/);
	assert.match(entries, /packs\/preset\.json/);
	assert.doesNotMatch(entries, /src\/|node_modules\/|\.DS_Store/);
	const packaged = JSON.parse(execFileSync('unzip', ['-p', archive, 'module.json'], { encoding: 'utf8' }));
	assert.equal(packaged.id, manifest.id);
	assert.equal(packaged.protected, true);
	assert.equal(packaged.manifest, 'https://r2.foundryvtt.com/packages-public/test-module/module.json');
	assert.equal(packaged.download, undefined);
	assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'module.json'), 'utf8')), manifest);
	assert.equal(await readFile(path.join(directory, 'LICENSE'), 'utf8'), 'Original licence');
	await rm(path.join(directory, 'packs'), { recursive: true });
	await packageModule(directory, 'protected');
	assert.doesNotMatch(execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }), /packs\//);
});

import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { applyDistributionMetadata } from './apply-distribution-metadata.mjs';

/** Build an upload archive from distribution files, leaving the source manifest and licence unchanged. */
export async function packageModule(directory, distribution = 'public') {
	if (!['public', 'protected', 'premium'].includes(distribution)) throw new Error('Unknown package distribution');
	const manifest = JSON.parse(await readFile(path.join(directory, 'module.json'), 'utf8'));
	if (!/^[\w-]+$/.test(manifest.id) || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version)) {
		throw new Error('The module manifest must declare a valid ID and version');
	}
	const output = path.join(directory, '.release', 'package');
	await rm(output, { recursive: true, force: true });
	await mkdir(output, { recursive: true });
	const files = ['module.json', 'LICENSE'];
	for (const name of ['assets', 'dist', 'lang', 'packs', 'scripts', 'storage', 'styles', 'templates', 'README.md', 'THIRD-PARTY-NOTICES.txt']) {
		try {
			await stat(path.join(directory, name));
			files.push(name);
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
	}
	for (const name of files) await cp(path.join(directory, name), path.join(output, name), { recursive: true });
	const manifestPath = path.join(output, 'module.json');
	if (distribution === 'premium') await applyDistributionMetadata('premium', manifestPath, path.join(output, 'LICENSE'));
	const packaged = JSON.parse(await readFile(manifestPath, 'utf8'));
	if (distribution !== 'public') {
		packaged.protected = true;
		packaged.manifest = `https://r2.foundryvtt.com/packages-public/${packaged.id}/module.json`;
		delete packaged.download;
		await writeFile(manifestPath, `${JSON.stringify(packaged, null, 2)}\n`);
	}
	const archive = path.join(directory, '.release', `${packaged.id}-${packaged.version}.zip`);
	await rm(archive, { force: true });
	const result = spawnSync('zip', ['-qr', archive, ...files, '-x', '*/.DS_Store', '*/._*'], { cwd: output, stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error('Failed to create the module ZIP');
	return archive;
}

/** Build with the selected edition before packaging its compiled distribution. */
async function main() {
	const distribution = process.argv[2] ?? 'public';
	const command = process.env.npm_execpath ? process.execPath : 'yarn';
	const args = process.env.npm_execpath ? [process.env.npm_execpath, 'build'] : ['build'];
	const result = spawnSync(command, args, {
		stdio: 'inherit',
		env: { ...process.env, RELEASE_CHANNEL: distribution === 'premium' ? 'premium' : 'public' },
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error('Module build failed; no ZIP was created');
	const archive = await packageModule(process.cwd(), distribution);
	process.stdout.write(`${archive}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

/** Add the template packaging command while preserving the project's other scripts and dependencies. */
async function configurePackaging() {
	const filename = 'package.json';
	let contents;
	try {
		contents = await readFile(filename, 'utf8');
	} catch (error) {
		if (error.code === 'ENOENT') return;
		throw error;
	}
	const distribution = process.argv[2] ?? 'public';
	if (!['public', 'protected', 'premium'].includes(distribution)) throw new Error('Unknown package distribution');
	const metadata = JSON.parse(contents);
	metadata.scripts ??= {};
	metadata.scripts.package = `node tools/package-module.mjs ${distribution}`;
	const indent = contents.match(/\n([\t ]+)"/)?.[1] ?? '\t';
	await writeFile(filename, `${JSON.stringify(metadata, null, indent)}\n`);
	let ignored = '';
	try {
		ignored = await readFile('.gitignore', 'utf8');
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
	if (!ignored.split('\n').some(line => ['.release/', '/.release/'].includes(line.trim()))) {
		await writeFile('.gitignore', `${ignored.trimEnd()}\n\n# Local upload archives and staging files\n/.release/\n`);
	}
}

configurePackaging().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

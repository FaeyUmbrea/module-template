import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

async function main() {
	const [sourcePath, destinationPath, tag, serverUrl, repository] = process.argv.slice(2);

	if (!sourcePath || !destinationPath || !tag || !serverUrl || !repository) {
		throw new Error('Usage: node tools/prepare-release.mjs SOURCE DESTINATION TAG SERVER_URL REPOSITORY');
	}

	const manifest = JSON.parse(await readFile(sourcePath, 'utf8'));
	const version = tag.startsWith('v') ? tag.slice(1) : tag;
	const releaseBase = `${serverUrl}/${repository}/releases`;

	manifest.version = version;
	manifest.url = `${serverUrl}/${repository}`;
	manifest.manifest = `${releaseBase}/latest/download/module.json`;
	manifest.download = `${releaseBase}/download/${tag}/module.zip`;

	await mkdir(dirname(destinationPath), { recursive: true });
	await writeFile(destinationPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

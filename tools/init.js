import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg.startsWith('--')) {
			const eq = arg.indexOf('=');
			if (eq !== -1) {
				args[arg.slice(2, eq)] = arg.slice(eq + 1);
			} else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
				args[arg.slice(2)] = argv[i + 1];
				i++;
			} else {
				args[arg.slice(2)] = true;
			}
		}
	}
	return args;
}

// ---------------------------------------------------------------------------
// Prompt helper
// ---------------------------------------------------------------------------

function ask(rl, question) {
	return new Promise(resolve => rl.question(question, resolve));
}

async function prompt(rl, label, defaultValue) {
	const answer = await ask(rl, `${label} [${defaultValue}]: `);
	return answer.trim() || defaultValue;
}

async function promptYN(rl, label, defaultYes = true) {
	const hint = defaultYes ? 'Y/n' : 'y/N';
	const answer = await ask(rl, `${label} (${hint}): `);
	const trimmed = answer.trim().toLowerCase();
	if (trimmed === '') return defaultYes;
	return trimmed === 'y' || trimmed === 'yes';
}

// ---------------------------------------------------------------------------
// Feature dependency partition
// ---------------------------------------------------------------------------

const FEATURE_DEPS = {
	svelte: {
		devDependencies: [
			'svelte',
			'@sveltejs/vite-plugin-svelte',
			'svelte-preprocess',
			'eslint-plugin-svelte',
		],
	},
	unit: {
		devDependencies: [
			'vitest',
			'@vitest/coverage-istanbul',
			'jsdom',
		],
	},
	e2e: {
		devDependencies: [
			'@playwright/test',
			'monocart-reporter',
		],
	},
	coverage: {
		devDependencies: [
			'nyc',
			'istanbul-lib-coverage',
		],
	},
	i18n: {
		devDependencies: [
			'flat',
		],
	},
};

const FEATURE_SCRIPTS = {
	unit: ['test:unit'],
	e2e: ['test:e2e', 'test:e2e:headed'],
	coverage: ['coverage:merge', 'test'],
};

// ---------------------------------------------------------------------------
// Text file detection
// ---------------------------------------------------------------------------

const BINARY_EXTENSIONS = new Set([
	'.cjs',
	'.gz',
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.ico',
	'.woff',
	'.woff2',
	'.ttf',
	'.otf',
	'.eot',
	'.mp3',
	'.mp4',
	'.zip',
	'.tar',
	'.7z',
]);

function isBinaryPath(filePath) {
	return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function looksLikeBinary(buf) {
	// Heuristic: check for null bytes in first 8000 bytes.
	const check = buf.slice(0, 8000);
	for (let i = 0; i < check.length; i++) {
		if (check[i] === 0) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Walk directory, yield file paths
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.git', '.yarn', 'dist', '.vite-cache']);

function* walkFiles(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) yield* walkFiles(full);
		} else {
			yield full;
		}
	}
}

// ---------------------------------------------------------------------------
// Step 1: Token replacement
// ---------------------------------------------------------------------------

function replaceTokens(content, tokenMap) {
	let result = content;
	for (const [token, value] of Object.entries(tokenMap)) {
		result = result.replaceAll(token, value);
	}
	return result;
}

function stepTokenReplacement(tokenMap) {
	console.warn('Step 1: Token replacement...');
	let count = 0;
	for (const filePath of walkFiles(ROOT)) {
		if (isBinaryPath(filePath)) continue;
		let buf;
		try {
			buf = fs.readFileSync(filePath);
		} catch {
			continue;
		}
		if (looksLikeBinary(buf)) continue;
		const original = buf.toString('utf8');
		const replaced = replaceTokens(original, tokenMap);
		if (replaced !== original) {
			fs.writeFileSync(filePath, replaced, 'utf8');
			count++;
		}
	}
	console.warn(`  Replaced tokens in ${count} file(s).`);
}

// ---------------------------------------------------------------------------
// Step 2: Feature marker preprocessing
// ---------------------------------------------------------------------------

// Supported marker comment styles per file extension.
function getMarkerStyle(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	if (ext === '.yml' || ext === '.yaml') return '#';
	if (ext === '.ts' || ext === '.js' || ext === '.svelte') return '//';
	return null;
}

function processMarkers(content, enabledFeatures, markerPrefix) {
	const lines = content.split('\n');
	const out = [];
	let skip = false;
	let keep = false;

	for (const line of lines) {
		const trimmed = line.trim();
		const ifMatch = trimmed.match(new RegExp(`^${escapeRegex(markerPrefix)}\\s+#if\\s+(\\w+)$`));
		const endifMatch = trimmed.match(new RegExp(`^${escapeRegex(markerPrefix)}\\s+#endif$`));

		if (ifMatch) {
			const feat = ifMatch[1];
			keep = enabledFeatures.has(feat);
			skip = !keep;
			// Always drop the marker line itself.
			continue;
		}
		if (endifMatch) {
			skip = false;
			keep = false;
			continue;
		}
		if (!skip) {
			out.push(line);
		}
	}
	return out.join('\n');
}

function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stepMarkerPreprocessing(enabledFeatures) {
	console.warn('Step 2: Feature marker preprocessing...');
	let count = 0;
	for (const filePath of walkFiles(ROOT)) {
		if (isBinaryPath(filePath)) continue;
		const markerPrefix = getMarkerStyle(filePath);
		if (!markerPrefix) continue;
		let buf;
		try {
			buf = fs.readFileSync(filePath);
		} catch {
			continue;
		}
		if (looksLikeBinary(buf)) continue;
		const original = buf.toString('utf8');
		if (!original.includes('#if ')) continue;
		const processed = processMarkers(original, enabledFeatures, markerPrefix);
		if (processed !== original) {
			fs.writeFileSync(filePath, processed, 'utf8');
			count++;
		}
	}
	console.warn(`  Processed markers in ${count} file(s).`);
}

// ---------------------------------------------------------------------------
// Step 3: package.json structural prune
// ---------------------------------------------------------------------------

function stepPrunePackageJson(enabledFeatures, version) {
	console.warn('Step 3: Pruning package.json...');
	const pkgPath = path.join(ROOT, 'package.json');
	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

	pkg.version = version;

	// Collect dep keys to remove.
	const removeDeps = new Set();
	for (const [feat, partition] of Object.entries(FEATURE_DEPS)) {
		if (!enabledFeatures.has(feat)) {
			for (const dep of (partition.devDependencies ?? [])) removeDeps.add(dep);
			for (const dep of (partition.dependencies ?? [])) removeDeps.add(dep);
		}
	}

	for (const dep of removeDeps) {
		delete pkg.devDependencies?.[dep];
		delete pkg.dependencies?.[dep];
	}

	// Collect scripts to remove.
	const removeScripts = new Set();
	for (const [feat, scripts] of Object.entries(FEATURE_SCRIPTS)) {
		if (!enabledFeatures.has(feat)) {
			for (const s of scripts) removeScripts.add(s);
		}
	}

	// Special handling for 'test' script when coverage off but some tests on.
	if (!enabledFeatures.has('coverage')) {
		removeScripts.add('coverage:merge');
		removeScripts.add('test');
		// Re-add test if at least one test runner remains.
		const hasUnit = enabledFeatures.has('unit');
		const hasE2e = enabledFeatures.has('e2e');
		if (hasUnit && hasE2e) {
			pkg.scripts.test = 'yarn test:e2e && yarn test:unit';
		} else if (hasUnit) {
			pkg.scripts.test = 'vitest run';
		} else if (hasE2e) {
			pkg.scripts.test = 'yarn playwright test';
		}
		// If neither, leave test removed.
	}

	for (const s of removeScripts) {
		delete pkg.scripts?.[s];
	}

	// The uuid resolution only patches nyc's coverage tooling; drop it without coverage.
	if (!enabledFeatures.has('coverage') && pkg.resolutions) {
		delete pkg.resolutions.uuid;
		if (Object.keys(pkg.resolutions).length === 0) delete pkg.resolutions;
	}

	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
	console.warn('  package.json updated.');
}

// ---------------------------------------------------------------------------
// Step 4: module.json structural
// ---------------------------------------------------------------------------

// Foundry version fields are JSON numbers; coerce when the input is numeric.
function asVersion(value) {
	const num = Number(value);
	return Number.isFinite(num) ? num : value;
}

function stepModuleJson(enabledFeatures, versions) {
	console.warn('Step 4: Updating module.json...');
	const modPath = path.join(ROOT, 'module.json');
	const mod = JSON.parse(fs.readFileSync(modPath, 'utf8'));

	mod.compatibility = {
		minimum: asVersion(versions.compatMin),
		verified: asVersion(versions.compatVerified),
		maximum: asVersion(versions.compatMax),
	};

	if (!enabledFeatures.has('i18n')) {
		mod.languages = [];
	}

	if (!enabledFeatures.has('styles')) {
		mod.styles = [];
	}

	fs.writeFileSync(modPath, `${JSON.stringify(mod, null, 2)}\n`, 'utf8');
	console.warn('  module.json updated.');
}

// ---------------------------------------------------------------------------
// Step 5: Delete feature files for disabled features
// ---------------------------------------------------------------------------

function rmrf(target) {
	if (!fs.existsSync(target)) return;
	fs.rmSync(target, { recursive: true, force: true });
	console.warn(`  Deleted: ${path.relative(ROOT, target)}`);
}

function stepDeleteFeatureFiles(enabledFeatures) {
	console.warn('Step 5: Deleting disabled-feature files...');

	if (!enabledFeatures.has('svelte')) {
		rmrf(path.join(ROOT, 'src', 'svelte'));
	}

	if (!enabledFeatures.has('styles')) {
		rmrf(path.join(ROOT, 'src', 'styles'));
	}

	if (!enabledFeatures.has('unit')) {
		rmrf(path.join(ROOT, 'src', 'example.test.ts'));
	}

	if (!enabledFeatures.has('e2e')) {
		rmrf(path.join(ROOT, 'playwright.config.js'));
		rmrf(path.join(ROOT, 'tests'));
	}

	if (!enabledFeatures.has('coverage')) {
		rmrf(path.join(ROOT, 'tools', 'merge-coverage.js'));
		rmrf(path.join(ROOT, '.nycrc'));
	}

	if (!enabledFeatures.has('i18n')) {
		rmrf(path.join(ROOT, 'lang'));
	}
}

// ---------------------------------------------------------------------------
// Step 6: Self-delete
// ---------------------------------------------------------------------------

function stepSelfDelete() {
	console.warn('Step 6: Cleaning up scaffolding files...');
	rmrf(path.join(ROOT, 'PLACEHOLDERS.md'));
	// Unlinking the running script is safe on POSIX; all fs work is already done.
	try {
		fs.rmSync(__filename, { force: true });
		console.warn('  Removed tools/init.js.');
	} catch {
		// Best-effort.
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const yes = !!args.yes;
	const keepInit = !!args['keep-init'];

	let rl = null;
	if (!yes) {
		rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	}

	async function get(argName, label, defaultValue) {
		if (args[argName]) return String(args[argName]);
		if (yes) return defaultValue;
		return prompt(rl, label, defaultValue);
	}

	async function getFeature(name, label) {
		if (args.features) {
			const list = String(args.features).split(',').map(s => s.trim());
			return list.includes(name);
		}
		if (yes) return true;
		return promptYN(rl, `Enable feature: ${label}`, true);
	}

	console.warn('\n--- Foundry VTT Module Scaffolding ---\n');

	const id = await get('id', 'Module ID (kebab-case)', 'my-module');
	const title = await get('title', 'Module Title', 'My Module');
	const description = await get('description', 'Description', 'A Foundry VTT module.');
	const authorName = await get('author', 'Author Name', 'Faey Umbrea');
	const authorUrl = await get('author-url', 'Author URL', 'https://github.com/FaeyUmbrea');
	const authorEmail = await get('author-email', 'Author Email', 'faey@void.monster');
	const githubUser = await get('github', 'GitHub Username', 'FaeyUmbrea');

	const version = await get('version', 'Module version', '0.0.1');
	const compatMin = await get('compat-min', 'Foundry compatibility — minimum', '13.344');
	const compatVerified = await get('compat-verified', 'Foundry compatibility — verified', '14');
	const compatMax = await get('compat-max', 'Foundry compatibility — maximum', '14');

	const featSvelte = await getFeature('svelte', 'svelte (Svelte 5 UI)');
	const featStyles = await getFeature('styles', 'styles (dedicated Stylus stylesheet)');
	const featUnit = await getFeature('unit', 'unit (Vitest unit tests)');
	const featE2e = await getFeature('e2e', 'e2e (Playwright tests)');
	const featI18n = await getFeature('i18n', 'i18n (localisation)');

	if (rl) rl.close();

	const featCoverage = featUnit && featE2e;

	const enabledFeatures = new Set([
		...(featSvelte ? ['svelte'] : []),
		...(featStyles ? ['styles'] : []),
		...(featUnit ? ['unit'] : []),
		...(featE2e ? ['e2e'] : []),
		...(featI18n ? ['i18n'] : []),
		...(featCoverage ? ['coverage'] : []),
	]);

	console.warn('\nConfiguration:');
	console.warn(`  id:          ${id}`);
	console.warn(`  title:       ${title}`);
	console.warn(`  description: ${description}`);
	console.warn(`  author:      ${authorName} <${authorEmail}>`);
	console.warn(`  author url:  ${authorUrl}`);
	console.warn(`  github:      ${githubUser}`);
	console.warn(`  version:     ${version}`);
	console.warn(`  foundry:     min ${compatMin} / verified ${compatVerified} / max ${compatMax}`);
	console.warn(`  features:    ${[...enabledFeatures].join(', ') || '(none)'}`);
	console.warn('');

	const tokenMap = {
		'{{MODULE_ID}}': id,
		'{{MODULE_TITLE}}': title,
		'{{MODULE_DESCRIPTION}}': description,
		'{{AUTHOR_NAME}}': authorName,
		'{{AUTHOR_URL}}': authorUrl,
		'{{AUTHOR_EMAIL}}': authorEmail,
		'{{GITHUB_USER}}': githubUser,
	};

	stepTokenReplacement(tokenMap);
	stepMarkerPreprocessing(enabledFeatures);
	stepPrunePackageJson(enabledFeatures, version);
	stepModuleJson(enabledFeatures, { compatMin, compatVerified, compatMax });
	stepDeleteFeatureFiles(enabledFeatures);

	if (!keepInit) {
		stepSelfDelete();
	}

	console.warn('\nDone! Next steps:');
	console.warn('  yarn install');
	console.warn('  yarn build');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

# Template Placeholders & Features

Run `node tools/init.js` to instantiate this template. The script replaces tokens,
strips disabled-feature code, and prunes `package.json` in place.

## Tokens

| Token | Default | Meaning |
|---|---|---|
| `{{MODULE_ID}}` | _(required)_ | Kebab-case module id; also the GitHub repo name |
| `{{MODULE_TITLE}}` | _(required)_ | Human-readable title |
| `{{MODULE_DESCRIPTION}}` | _(required)_ | One-line description |
| `{{AUTHOR_NAME}}` | `Faey Umbrea` | Author display name |
| `{{AUTHOR_URL}}` | `https://github.com/FaeyUmbrea` | Author URL |
| `{{AUTHOR_EMAIL}}` | `faey@void.monster` | Contact email (used in SECURITY.md) |
| `{{GITHUB_USER}}` | `FaeyUmbrea` | GitHub username |

GitHub repo path is always `{{GITHUB_USER}}/{{MODULE_ID}}`.

## Versions

These are set structurally in `module.json` / `package.json` (not tokens):

| Flag | Default | Meaning |
|---|---|---|
| `--version` | `0.0.1` | Initial `package.json` version |
| `--compat-min` | `13.344` | Foundry `compatibility.minimum` |
| `--compat-verified` | `14` | Foundry `compatibility.verified` |
| `--compat-max` | `14` | Foundry `compatibility.maximum` |

Numeric inputs are written as JSON numbers (e.g. `14`, `13.344`).

## Feature Flags

All features are **on by default**. Pass `--features a,b,c` to enable only specific ones.

| Flag | What it controls |
|---|---|
| `svelte` | Svelte 5 UI (vite-plugin-svelte, svelte-preprocess, eslint svelte support, `src/svelte/`, svelte mount in `index.ts`) |
| `styles` | Dedicated Stylus stylesheet (`src/styles/`, the `index.ts` style import, `styles` in `module.json`) |
| `unit` | Vitest unit tests (`src/example.test.ts`, `test:unit` script) |
| `e2e` | Playwright tests (`playwright.config.js`, `tests/`, `test:e2e` scripts) |
| `i18n` | Localisation (`lang/`, `languages` in `module.json`) |

`coverage` is a derived feature: merged coverage tooling is included only when **both** `unit` and `e2e` are enabled.

## Usage

Interactive (prompts for each value):

```sh
node tools/init.js
```

Non-interactive:

```sh
node tools/init.js \
  --id my-module \
  --title "My Module" \
  --description "Does cool things" \
  --author "Your Name" \
  --author-url https://github.com/yourname \
  --author-email you@example.com \
  --github yourname \
  --version 0.0.1 \
  --compat-min 14 --compat-verified 14 --compat-max 14 \
  --features svelte,styles,unit,e2e,i18n \
  --yes
```

Pass `--keep-init` to prevent the script from deleting itself and this file after running.

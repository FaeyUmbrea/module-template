# {{MODULE_TITLE}}

{{MODULE_DESCRIPTION}}

## Development

```sh
yarn install        # install dependencies
yarn dev            # start Vite dev server (proxies to Foundry on :30000)
yarn build          # production build → dist/
yarn lint           # run ESLint
yarn lint:fix       # run ESLint with auto-fix
yarn test:unit      # run Vitest unit tests
yarn test:e2e       # run Playwright end-to-end tests
yarn test:e2e:headed  # same but with a visible browser window
yarn test           # unit + e2e + merge coverage (requires both features)
```

Before running the dev server, symlink the project into your Foundry modules directory:

```sh
yarn linkFoundry
```

## Scaffolding

This repository is a template. After cloning, run:

```sh
node tools/init.js
```

The script prompts for your module id, title, description, author info, and which features to enable (`svelte`, `styles`, `unit`, `e2e`, `i18n`). It replaces placeholder tokens, strips disabled-feature code, and prunes unused dependencies from `package.json`.

The GitHub Actions workflows ship disabled (`.github/workflows/*.yml.disabled`) so no CI runs until you scaffold; `tools/init.js` activates them by stripping the `.disabled` suffix.

For non-interactive use:

```sh
node tools/init.js --id my-module --title "My Module" --description "Does things" \
  --author "Your Name" --author-url https://github.com/yourname \
  --author-email you@example.com --github yourname \
  --features svelte,styles,unit,e2e,i18n --yes
```

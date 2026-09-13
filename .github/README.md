# Foundry VTT module template

Versioned Copier template for FaeyUmbrea's Foundry VTT modules. It creates TypeScript/Vite modules and static content-pack modules, then keeps their shared repository machinery updateable.

## Create a module

```sh
uvx copier copy gh:FaeyUmbrea/module-template ./my-module
```

Copier records the selected template version and answers in `.copier-answers.yml`.

## Update a module

Commit or otherwise secure local changes first, then run:

```sh
uvx copier update
```

Use released template tags for module repositories. `--vcs-ref=HEAD` is reserved for testing template changes before tagging them.

## Ownership

Copier owns shared development and release machinery. Module source, tests, assets, packs, translations, changelogs, licenses, and README prose are generated once and then left under the module repository's control.


# Contributing to Ralphdex

## Getting started

1. Fork the repo and create a branch from `main`.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the validation gate before and after your change:

   ```bash
   npm run validate
   ```

   This runs compile → type-check → docs → tests. All must pass.

4. Press `F5` to launch the Extension Development Host and smoke-test interactively.

## Where things live

See [`CLAUDE.md`](CLAUDE.md) for the full module map and [`AGENTS.md`](AGENTS.md) for the authoritative routing document.

| Concern | File(s) |
|---|---|
| Extension source | `src/` |
| Tests | `test/` |
| Prompt templates | `prompt-templates/` |
| Architecture docs | `docs/` |

## Conventions

- Keep docs in sync with code in the same PR.
- Run `npm run check:docs` to catch doc/architecture drift.
- Prefer updating the focused doc that owns a rule over restating it elsewhere.
- Use `git add <specific-files>` rather than `git add .`.

## Configuration Change Checklist

Any PR that adds, removes, or modifies a `ralphCodex.*` configuration setting must verify all three surfaces stay aligned:

- [ ] **Manifest** — `package.json` `contributes.configuration.properties` entry has the correct `default`, `type`, `enum` (if applicable), and `description`. The description must state the actual default value and must not contain "reserved for future use" if the feature is implemented.
- [ ] **Runtime defaults** — `src/config/defaults.ts` `DEFAULT_CONFIG` and `src/config/readConfig.ts` produce the same effective default as the manifest.
- [ ] **Operator docs** — `docs/workflows.md` (or the focused doc that owns the feature) describes the setting with an explicit maturity marker (`stable`, `beta`, or `experimental`) when the feature is non-trivial.

`npm run check:docs` enforces a subset of these rules automatically (config-default drift and description-default contradiction detection). Reviewers should still verify the docs narrative matches the implementation.

## Reporting issues

Open an issue on GitHub with a clear description of the problem and steps to reproduce. Include your VS Code version, extension version, and the relevant entry from `.ralph/logs/extension.log` if available.

## License

By contributing you agree your changes will be licensed under the [MIT License](LICENSE).

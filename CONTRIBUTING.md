# Contributing to Ralph Codex Workbench

## Getting started

1. Fork the repo and create a branch from `main`.
2. Install dependencies from the extension package root:

   ```bash
   cd ralph-codex-vscode-starter
   npm install
   ```

3. Run the validation gate before and after your change:

   ```bash
   cd ralph-codex-vscode-starter && npm run validate
   ```

   This runs compile → type-check → docs → tests. All must pass.

4. Launch the Extension Development Host with `F5` from the repo root to smoke-test interactively.

## Where things live

See [`CLAUDE.md`](CLAUDE.md) for the full module map and [`ralph-codex-vscode-starter/AGENTS.md`](ralph-codex-vscode-starter/AGENTS.md) for the authoritative routing document.

| Concern | File(s) |
|---|---|
| Extension source | `ralph-codex-vscode-starter/src/` |
| Tests | `ralph-codex-vscode-starter/test/` |
| Prompt templates | `ralph-codex-vscode-starter/prompt-templates/` |
| Architecture docs | `ralph-codex-vscode-starter/docs/` |

## Conventions

- Keep docs in sync with code in the same PR.
- Run `npm run check:docs` to catch doc/architecture drift.
- Prefer updating the focused doc that owns a rule over restating it elsewhere.
- Use `git add <specific-files>` rather than `git add .`.

## Reporting issues

Open an issue on GitHub with a clear description of the problem and steps to reproduce. Include your VS Code version, extension version, and the relevant entry from `.ralph/logs/extension.log` if available.

## License

By contributing you agree your changes will be licensed under the [MIT License](LICENSE).

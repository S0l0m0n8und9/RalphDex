# AGENTS.md

## Purpose

This repository is a serious v1 of a VS Code extension that supports repo-aware prompt generation, Codex IDE handoff, and Ralph-style `codex exec` loops.

## Non-Negotiables

- Do not invent unsupported Codex IDE APIs.
- Treat clipboard plus VS Code command execution as the interactive handoff boundary.
- Treat `codex exec` as the supported automation boundary.
- Keep the architecture thin and explicit.
- Keep durable Ralph memory on disk under `.ralph/`.
- Prefer boring reliability over speculative convenience.

## Module Map

- Entrypoint: `src/extension.ts`
- Commands: `src/commands/`
- Codex integration strategies: `src/codex/`
- Configuration: `src/config/`
- Prompt generation: `src/prompt/`
- Ralph state and schemas: `src/ralph/`
- Logging, process running, workspace inspection: `src/services/`
- Pure tests: `test/`

## Project Conventions

- TypeScript, CommonJS output, strict mode.
- Keep VS Code dependencies at the edge. Pure logic belongs in testable modules.
- Register commands in `src/commands/registerCommands.ts` and contribute them in `package.json`.
- Runtime state belongs in `.ralph/state.json` plus VS Code `workspaceState`.
- Prompt, transcript, last-message, and log artifacts belong under `.ralph/`.
- The task file schema is versioned and should stay machine-friendly.
- README and AGENTS.md must stay aligned with real behavior.

## Ralph File Expectations

- `prd.md` is the durable objective.
- `progress.md` is the durable narrative log.
- `tasks.json` is the structured backlog.
- `state.json` is extension-managed runtime state.
- `prompts/`, `runs/`, and `logs/` are generated artifacts and should be reproducible.

## Validation Expectations

- Run `npm run compile` after source changes.
- Run `npm run lint` for type-level validation.
- Run `npm test` when pure logic changes.
- If a command path or API limitation is uncertain, document the fallback rather than hiding it.

## Coding Guidance

- Prefer config-backed strategy selection over hard-coded assumptions.
- When adding new logic, decide whether it belongs in `commands`, `codex`, `prompt`, `ralph`, or `services` before editing.
- Keep prompts explicit and file-backed.
- Keep user-visible errors actionable and keep internal logs structured.
- Avoid adding new dependencies unless they materially simplify the extension.

## Near-Term Follow-Ups

1. Add semantic stop criteria and optional review passes to the Ralph loop.
2. Improve workspace scanning beyond root-level manifest inspection.
3. Add optional Git checkpoints or worktree isolation for loop iterations.

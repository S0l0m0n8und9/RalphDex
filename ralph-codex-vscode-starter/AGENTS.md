# AGENTS.md

## Purpose

This repository is a starter VS Code extension for orchestrating repo-aware prompts and Ralph-style Codex iterations.

## Working rules

- Keep the architecture thin.
- Prefer public Codex interfaces over reverse-engineering private extension internals.
- Do not claim direct prompt injection into the Codex IDE extension unless a documented API exists.
- Preserve the split between the IDE lane and the CLI automation lane unless there is a strong reason to collapse them.
- Persist loop memory in files under `.ralph/`.
- Prefer minimal, production-oriented code changes over tutorial scaffolding.

## Project map

- Extension entrypoint: `src/extension.ts`
- Prompt generation: `src/promptFactory.ts`
- Workspace inspection: `src/repoScanner.ts`
- CLI iteration loop: `src/loopRunner.ts`
- Config access: `src/config.ts`
- Durable Ralph state: `.ralph/`

## Conventions

- TypeScript, CommonJS output.
- No heavy framework unless justified.
- Any new commands should be contributed via `package.json` and registered in `src/extension.ts`.
- Keep prompts explicit, file-backed, and reusable.
- Prefer a stronger schema rather than more prose when evolving Ralph task state.

## Change expectations

- Update README when behavior changes.
- Update settings documentation when configuration changes.
- Keep limitations explicit and honest.
- When adding automation, default to safer Codex sandbox / approval settings.

## Near-term roadmap

1. Replace naive repo scanning with real parsers.
2. Add richer `.ralph/tasks.json` schema.
3. Add loop stop criteria beyond fixed iteration count.
4. Add worktree / branch isolation.
5. Add verifier / reviewer agent flows.
6. Add MCP integrations where they materially improve repo understanding or validation.

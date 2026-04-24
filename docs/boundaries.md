# Boundaries

This document owns what Ralphdex explicitly does not try to do and where its trust guarantees stop.

Related docs:

- [Architecture](architecture.md) for module shape
- [Provenance](provenance.md) for trust-chain details
- [Verifier](verifier.md) for stop and review semantics
- [Multi-Agent Readiness](multi-agent-readiness.md) for the historical acceptance record that unlocked built-in multi-agent orchestration

## Codex Product Boundary

Supported paths:

- IDE handoff through clipboard plus `vscode.commands.executeCommand(...)`
- scripted automation through provider CLI/direct execution (`codex`, `claude`, `copilot`, `copilot-foundry`, `azure-foundry`, `gemini`)

Unsupported assumptions:

- direct composer injection
- private or invented AI IDE APIs
- treating `preferredHandoffMode = cliExec` as if `Open Codex IDE` should run the CLI

## Trust Boundary

Ralph proves different things on different paths:

- CLI/direct execution: prepared prompt, persisted plan, and launch payload integrity up to the provider execution boundary
- IDE handoff: prepared prompt bundle only

Ralph does not prove:

- what the model internally decided after launch
- what a human later edited before pasting or running in the IDE
- that a prompt implies a particular diff without verifier evidence

## Control-Plane Boundary

Ralph is intentionally deterministic. It does not try to become a general autonomous planner.

The current shipped control plane includes:

- sequential single-iteration and loop commands
- built-in multi-agent loop orchestration
- pipeline orchestration with durable checkpoints, optional human-review gate, and resume support

The 2026-03-17 readiness criteria for task ownership, write serialisation, and remediation isolation were satisfied before this multi-agent surface shipped; see [docs/multi-agent-readiness.md](multi-agent-readiness.md) for the acceptance record.

The single-agent CLI iteration/loop runner still exists as a first-class command path, but it now sits alongside shipped multi-agent and pipeline orchestration commands.

Durable `.ralph` state remains control-plane-owned during normal CLI task execution. The model may propose selected-task status through the structured completion report, but Ralph is the only component that persists `.ralph/tasks.json` or `.ralph/progress.md` on that path.

Autonomy mode does not change the principal-agent model. The operator remains the principal, and `autonomyMode` only changes a bounded set of loop defaults. Blocking preflight diagnostics and explicit task/provenance contracts remain enforced; hard stops and human-review behavior follow the configured gates (`stopOnHumanReviewNeeded`, `pipelineHumanGates`, and operator presets).

It does not:

- let the model freely choose implementation work outside the durable task file; backlog replenishment must still write explicit next tasks back into `.ralph/tasks.json`
- let the model arbitrarily rewrite durable Ralph state during normal CLI task execution
- replace deterministic stop logic with freeform intent inference
- inject raw transcript dumps into future prompts
- build a deep repo indexer or full-repo enumeration pass as part of prompt shaping
- become an open-ended autonomous swarm without bounded roles, deterministic state transitions, and durable artifact evidence

## Repository Layout And Workspace State

When the repository itself is the Ralph workspace, as in this repo, some `.ralph` files are project artifacts that belong alongside source and are safe to commit:

- `.ralph/prd.md` — product objective and requirements
- `.ralph/tasks.json` — task graph and backlog state
- `.ralph/progress.md` — progress notes across sessions
- `.ralph/memory-summary.md` — condensed memory state when using summary memory strategy

The rest of the runtime tree is operator-local runtime state and must not be committed:

- `.ralph/state.json` — current session runtime state (cursor, claims, iteration count)
- `.ralph/logs/` — execution logs per session
- `.ralph/prompts/` — generated prompts per iteration
- `.ralph/runs/` — raw provider transcripts per run
- `.ralph/artifacts/` — iteration provenance bundles, diagnostic reports, and latest-pointer artifacts
- `.ralph/agents/` — per-agent history metadata per session
- `.ralph/handoff/` — session clean-stop handoff notes

This distinction keeps the durable project brief, task graph, progress log, and condensed memory reviewable in version control while leaving machine-local execution state, logs, prompts, transcripts, and generated evidence out of the committed source tree.

## Workspace And Runtime Boundary

Supported runtime baseline:

- Node 20+ for packaging and supported runtime expectations

Workspace boundaries:

- untrusted workspaces support status inspection only
- virtual workspaces are unsupported
- the workspace must be a real local folder because Ralph reads and writes durable files and may launch provider CLIs or direct provider calls

## Git And Safety Boundary

Git handling is reporting only.

Ralph does not:

- create branches, tags, or worktrees
- perform destructive git operations
- turn git checkpoints into orchestration or rollback automation

## Testing Boundary

The default test strategy stays lightweight.

The repo does not currently try to prove through automated tests:

- live clipboard handoff behavior in a real host OS session
- live VS Code command handoff behavior in a real Extension Development Host session
- real provider-backed execution against live external services
- heavy Extension Development Host UI automation

Those areas require manual verification when changed.

## Self-Dogfooding Boundary

RalphDex is the extension that runs itself on this repository. To avoid self-modification hazards, the repo observes a clear split between work appropriate for Ralph loops and work that must use direct Codex.

**Use RalphDex for:**

- Adding or refining tests (`test/`)
- Writing or improving documentation (`docs/`, README.md, code comments)
- Invariant checks and structural audits of the codebase
- Repository hygiene tasks (reformatting, unused-code removal, dependency audits)
- Non-critical bug fixes that do not affect the harness itself

These tasks are **bounded and verifiable**: Ralph can validate its own work through tests, docs links, type checking, and lint passes without trusting that the harness changes are sound before relying on the next iteration.

**Use direct Codex for:**

- Control-plane changes (decision logic in `src/ralph/loopLogic.ts`, task selection in `src/ralph/taskFile.ts`, iteration orchestration in `src/ralph/iterationEngine.ts`)
- Provider execution and invocation (CLI shim, provider routing, execution strategies in `src/codex/`)
- Process runner and command wiring (`src/commands/registerCommands.ts`)
- Configuration interpretation (`src/config/`, settings schema)
- Iteration engine restructuring, prompt template changes, or major architectural changes to the loop itself

These are **control-plane changes** that Ralph depends on to function. Modifying the harness while relying on that same harness to validate the change creates a logical dependency cycle. Ralph cannot prove its own self-modifications are correct before using them.

**Rationale:** Ralph is a verifier and executor. Its value is deterministic validation that work is complete. Self-modifying the harness while relying on that harness to verify the modification breaks that property. When in doubt, use direct Codex to inspect and change the control plane, then rerun Ralph afterward if needed to validate follow-on tasks.

This boundary is not absolute — judgment calls may apply depending on scope and risk. But the principle is: avoid letting Ralph depend on its own untested changes to itself.

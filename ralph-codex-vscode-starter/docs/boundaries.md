# Boundaries

This document owns what Ralph Codex Workbench explicitly does not try to do and where its trust guarantees stop.

Related docs:

- [Architecture](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/architecture.md) for module shape
- [Provenance](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md) for trust-chain details
- [Verifier](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md) for stop and review semantics

## Codex Product Boundary

Supported paths:

- IDE handoff through clipboard plus `vscode.commands.executeCommand(...)`
- scripted automation through `codex exec`

Unsupported assumptions:

- direct composer injection
- private or invented Codex IDE APIs
- treating `preferredHandoffMode = cliExec` as if `Open Codex IDE` should run the CLI

## Trust Boundary

Ralph proves different things on different paths:

- CLI execution: prepared prompt, persisted plan, and stdin payload integrity up to the `codex exec` boundary
- IDE handoff: prepared prompt bundle only

Ralph does not prove:

- what the model internally decided after launch
- what a human later edited before pasting or running in the IDE
- that a prompt implies a particular diff without verifier evidence

## Control-Plane Boundary

Ralph is intentionally deterministic. It does not try to become a general autonomous planner.

The shipped control plane is a single-agent iteration/loop runner. Broad multi-agent orchestration stays deferred until nested workspace, inspection, execution, and verification root policy remains deterministic, test-backed, and evidence-backed.

Durable `.ralph` state remains control-plane-owned during normal CLI task execution. The model may propose selected-task status through the structured completion report, but Ralph is the only component that persists `.ralph/tasks.json` or `.ralph/progress.md` on that path.

It does not:

- let the model freely choose implementation work outside the durable task file; backlog replenishment must still write explicit next tasks back into `.ralph/tasks.json`
- let the model arbitrarily rewrite durable Ralph state during normal CLI task execution
- replace deterministic stop logic with freeform intent inference
- inject raw transcript dumps into future prompts
- build a deep repo indexer or full-repo enumeration pass as part of prompt shaping
- spawn or coordinate multiple Codex agents against the same workspace as part of the built-in loop

## Workspace And Runtime Boundary

Supported runtime baseline:

- Node 20+ for packaging and supported runtime expectations

Workspace boundaries:

- untrusted workspaces support status inspection only
- virtual workspaces are unsupported
- the workspace must be a real local folder because Ralph reads and writes durable files and may launch the Codex CLI

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
- real `codex exec` execution against the Codex service
- heavy Extension Development Host UI automation

Those areas require manual verification when changed.

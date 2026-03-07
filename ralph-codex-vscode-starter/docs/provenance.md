# Provenance

This document owns how Ralph links plans, prompts, invocations, and run bundles into a trusted record.

Related docs:

- [Invariants](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md) for artifact-model rules
- [Verifier](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md) for post-execution evaluation
- [Boundaries](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md) for trust limits

## Provenance Unit

Every meaningful Ralph attempt mints a stable provenance id and threads it through:

- preflight
- prompt evidence
- execution plan
- CLI invocation when CLI execution happens
- iteration result when an iteration completes
- run-level provenance bundle artifacts

The provenance id is the join key for a prepared, executed, or blocked attempt.

## What Gets Bound Before Execution

Before execution, Ralph must persist an execution plan that binds:

- selected task id and title
- prompt kind
- prompt target
- template path
- prompt artifact path
- prompt hash

Prompt generation also persists `prompt-evidence.json`, which records:

- template path
- selection reason
- compact structured inputs used to render the prompt

CLI execution must run the verified persisted prompt artifact content, not an ad hoc in-memory string.

## CLI Provenance Chain

For `cliExec`, the trusted chain is:

1. preflight runs and persists its report
2. prompt rendering persists `prompt.md` and `prompt-evidence.json`
3. execution-plan persistence records the selected task, template, target, and prompt hash
4. launch re-reads the plan artifact and verifies its hash
5. launch re-reads the prompt artifact and verifies its hash against the plan
6. `codex exec` runs with the persisted prompt payload
7. `cli-invocation.json` records command path, args, workspace root, prompt artifact path, planned prompt hash, and stdin hash
8. iteration-result and run-bundle artifacts capture the outcome

This is the strongest guarantee Ralph makes:

- CLI runs prove selected, rendered, and executed prompt integrity up to the `codex exec` boundary.

## IDE Handoff Provenance Chain

For `ideHandoff`, Ralph still persists:

- preflight evidence
- `prompt.md`
- `prompt-evidence.json`
- `execution-plan.json`
- a run-level provenance bundle

The guarantee is intentionally weaker:

- Ralph proves the prepared prompt bundle.
- Ralph does not prove what a human later pastes, edits, or runs in the IDE.

## Integrity Failure Stages

Blocked launch-integrity failures are first-class provenance events.

Covered stages:

- `executionPlanHash`
- `promptArtifactHash`
- `stdinPayloadHash`

When one of those checks fails before meaningful execution:

- Ralph blocks before treating the attempt as a normal CLI run
- `provenance-failure.json` records the stage plus available expected/actual hashes
- `provenance-failure-summary.md` explains the block in human-readable form
- the run bundle keeps copied preflight, prompt, prompt-evidence, and execution-plan surfaces
- latest provenance pointers refresh to the blocked evidence

## Run Bundle Contract

Each provenance bundle should remain inspectable as a coherent folder under `.ralph/artifacts/runs/<provenance-id>/`.

The bundle summary is the primary human-readable surface. Machine-readable siblings make the proof chain inspectable without reconstructing state from logs.

`Open Latest Provenance Bundle` should prefer the summary first. `Reveal Latest Provenance Bundle Directory` should reveal the folder that contains the copied evidence set.

## What Operators Can Verify

To confirm what actually ran for a CLI iteration, inspect:

- `.ralph/artifacts/latest-provenance-summary.md`
- `.ralph/artifacts/latest-execution-plan.json`
- the `promptArtifactPath` referenced by that plan
- `.ralph/artifacts/latest-cli-invocation.json`

The trust check is simple:

- the plan hash matches the persisted plan artifact
- the prompt hash matches the persisted prompt artifact
- the stdin hash matches the rendered prompt hash

If that chain breaks, the attempt should surface as a blocked integrity failure rather than an ambiguous execution record.

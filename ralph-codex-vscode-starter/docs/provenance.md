# Provenance

This document owns how Ralph links plans, prompts, invocations, and run bundles into a trusted record.

Related docs:

- [Invariants](invariants.md) for artifact-model rules
- [Verifier](verifier.md) for post-execution evaluation
- [Boundaries](boundaries.md) for trust limits

## Provenance Unit

Every meaningful Ralph attempt mints a stable provenance id and threads it through:

- preflight
- prompt evidence
- execution plan
- CLI invocation when CLI execution happens
- iteration result when an iteration completes
- task remediation artifacts when repeated-stop evidence produces a bounded recommendation
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
- prompt byte length plus prompt-budget accounting when budgeting is active
- the exact repo-context snapshot used for rendering, including inspected root selection, any manual inspection-root override status, and concise empty-field evidence

When prompt budgeting applies, the evidence also records:

- the selected policy name for the current prompt kind and target
- whether the prompt stayed within budget or required trimming
- whether the final rendered prompt landed within target or still exceeded it after trimming
- target tokens plus an estimated token count, token delta from target, and range
- which sections were always required for that prompt policy
- the fixed omission order used for lower-priority sections
- which sections were kept
- which lower-priority sections were omitted

CLI execution must run the verified persisted prompt artifact content, not an ad hoc in-memory string.

## CLI Provenance Chain

For `cliExec`, the trusted chain is:

1. preflight runs and persists its report
2. prompt rendering persists `prompt.md` and `prompt-evidence.json`
3. execution-plan persistence records the selected task, template, target, prompt hash, and the explicit workspace/inspection/execution/verification root policy
4. launch re-reads the plan artifact and verifies its hash
5. launch re-reads the prompt artifact and verifies its hash against the plan
6. `codex exec` runs with the persisted prompt payload
7. `cli-invocation.json` records command path, args, workspace root, root policy, prompt artifact path, planned prompt hash, and stdin hash
8. iteration-result, execution-summary, and run-bundle artifacts capture the outcome, including the summarized `codex exec` message plus the transcript and stderr paths

This is the strongest guarantee Ralph makes:

- CLI runs prove selected, rendered, and executed prompt integrity up to the `codex exec` boundary.
- For nested workspaces, that proof includes which root Ralph inspected, whether a manual inspection-root override was applied or rejected, and which root it actually executed and verified from.

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
`Open Latest Prompt Evidence` should open the stable latest prompt-evidence manifest directly. `Open Latest CLI Transcript` should open the transcript referenced by the stable latest CLI-invocation manifest, or the corresponding last-message artifact when that transcript path is unavailable.

Repeated-stop remediation is part of the persisted evidence chain, but it is intentionally narrower than execution provenance:

- `task-remediation.json` ties a repeated-stop recommendation back to the same iteration directory and `iteration-result.json`
- `.ralph/artifacts/latest-remediation.json` is a stable latest pointer for the newest applicable remediation artifact
- the remediation artifact records deterministic trigger history, bounded proposed action, and any suggested child tasks
- the remediation artifact is advisory evidence for operator review; it is not itself proof that `.ralph/tasks.json` changed

That last distinction matters for approval flow. The recommendation can be persisted automatically, but a task-graph mutation happens only if the operator later runs `Apply Latest Task Decomposition Proposal`, and that write must still pass task-file validation at apply time.

## Latest Surface Recovery

The latest human-readable surfaces are convenience entry points backed by stronger JSON records.

When `latest-summary.md`, `latest-preflight-summary.md`, or `latest-provenance-summary.md` is missing but the corresponding latest JSON artifact still exists, Ralph may deterministically repair the Markdown surface from that JSON record during status refresh or open-latest flows.

That recovery does not widen the trust model:

- Ralph recreates only a derived human-readable summary from an existing latest JSON record.
- Ralph does not fabricate a missing latest JSON pointer, prompt artifact, transcript, or provenance bundle.
- If the JSON record is missing too, the surface should be reported as stale so operators know the trust chain is incomplete.

`Open Latest CLI Transcript` is related but slightly different: it is an inspection fallback, not a provenance repair. When the latest CLI invocation still exists but its transcript path is absent or stale, Ralph may open the surviving last-message artifact instead so the operator can still inspect the newest CLI-visible output without claiming that the full transcript survived.

## What Operators Can Verify

To confirm what actually ran for a CLI iteration, inspect:

- `.ralph/artifacts/latest-provenance-summary.md`
- `.ralph/artifacts/latest-execution-plan.json`
- `.ralph/artifacts/latest-prompt-evidence.json`
- the `promptArtifactPath` referenced by that plan
- `.ralph/artifacts/latest-cli-invocation.json`

To confirm why Ralph stopped retrying and what bounded next step it proposed, inspect:

- `.ralph/artifacts/latest-remediation.json`
- the iteration-local `task-remediation.json`
- the linked `iteration-result.json` and summary in the same iteration directory

The trust check is simple:

- the plan hash matches the persisted plan artifact
- the prompt hash matches the persisted prompt artifact
- the stdin hash matches the rendered prompt hash

If that chain breaks, the attempt should surface as a blocked integrity failure rather than an ambiguous execution record.

## Epistemic Gap

The CLI provenance chain proves prompt integrity up to the `codex exec` boundary. It proves that the correct rendered prompt was selected, hashed, persisted, and passed to the CLI without modification. It does not prove anything about what happened inside the model after that boundary.

The completion report is a model's self-report. It is labelled as unverified in the run bundle. The field name `completionReportStatus` makes that epistemic status machine-readable so downstream tooling can distinguish verified evidence from model assertion.

`reconciliationWarnings` records cases where the model's claimed status diverged from what preflight and verifier evidence found. A warning entry means an inconsistency was detected and surfaced; the absence of warnings means the model's claimed status was consistent with the observable verifier signals. Absence of reconciliation warnings does not prove the model's reasoning was correct — it proves only that the model's claimed status was consistent with those observable signals.

Operators requiring stronger guarantees should treat the verifier artifacts — `validationCommand`, `gitDiff`, and `taskState` — as the authoritative evidence and treat the completion report as supplementary context. Those artifacts are produced from observable outcomes, not from the model's self-description.

# Ralph Prompt: iteration (cliExec)

You are working inside a VS Code extension repository that orchestrates Ralph-guided Codex iterations with durable state, provenance bundles, deterministic stop logic, and prompt/context integrity.

## Task Focus
Selected task: T8.1
Parent task: T8
Title: Persist chosen inspection root in prompt evidence, execution plans, provenance bundles, and status surfaces

## Objective

Ralph already detects the nested `ralph-codex-vscode-starter` project root when the umbrella workspace root has no shallow repo markers. However, the chosen inspection root is not yet fully persisted across all control-plane evidence surfaces.

Your job now is to make the selected root explicit, durable, and inspectable everywhere it matters.

## Why this matters

Before Ralph broadens into more autonomous multi-agent behavior, it must be able to prove:
- workspace root
- chosen inspection root
- whether root selection was automatic or overridden
- where that root appears in prompt evidence, execution plans, provenance bundles, and status surfaces

This task is about persistence and evidence first, not yet changing CLI/verifier cwd semantics.

## Scope

Do only the work needed for T8.1.

Focus on:
- prompt evidence
- execution plan / provenance bundle
- status surfaces
- any justified durable state fields

Do not yet implement full execution-root or verifier-root policy unless a tiny supporting change is unavoidable.

## Required outcomes

1. Persist the chosen inspection root in:
   - prompt evidence
   - execution plan
   - provenance bundle
   - status output / latest-summary surfaces where appropriate

2. Persist selection metadata that makes the choice understandable, such as:
   - workspace root
   - chosen inspection root
   - automatic vs overridden selection
   - selection reason/mode if already available cheaply

3. Keep the representation deterministic, file-backed, and easy to inspect.

4. Add or update tests covering:
   - nested child repo chosen from umbrella root
   - evidence persistence of the chosen root
   - status output including the chosen root

5. Update docs only where needed to reflect the new evidence fields.

## Constraints

- Keep inspection shallow and deterministic.
- Do not recurse beyond immediate children unless explicitly configured.
- Do not invent unsupported Codex IDE APIs.
- Do not implement broad multi-agent behavior in this run.
- Do not yet change CLI/verifier working directory policy unless absolutely required for consistency.
- Keep architecture thin and testable.

## Implementation guidance

- First inspect the current implementation for:
  - workspace scanning
  - workspace inspection
  - prompt builder repo-context inputs
  - execution plan/provenance structures
  - status reporting
  - tests and docs

- Then identify all places where chosen inspection root should be persisted but currently is not.

- Implement the smallest coherent change that makes the root choice durable and inspectable end to end.

## Deliverables

- persisted inspection-root evidence across relevant artifacts
- tests
- concise doc updates

## Final response contract

End with:
- changed files
- validation results
- assumptions
- known limitations
- recommended next 3 improvements
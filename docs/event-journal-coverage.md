# Event Journal Coverage

This audit owns the operator-trust coverage matrix for `src/ralph/eventJournal.ts` and the Run Trust Timeline projection in `src/ralph/runTimeline.ts`.

The journal is not a debug log. Emit one event for each semantic runtime action an operator may need to explain after a run. Repeated low-level file writes, logger messages, and raw process chunks stay out of the journal unless they become durable trust decisions.

## Coverage Matrix

| Runtime action | Event coverage | Emit site | Timeline behavior | Status |
| --- | --- | --- | --- | --- |
| Run start | `run_started` | `RalphIterationEngine.runCliIteration` after preparation | timeline entry, start timestamp | covered |
| Task selection | `task_selected` | `RalphIterationEngine.runCliIteration` after preparation | timeline entry, current task | covered |
| Task-state transition | `task_state_changed` | `RalphIterationEngine.runCliIteration` after reconciliation/classification and planning-gate blocks | timeline entry and task-state total | covered |
| Provider invocation | `provider_invoked` | `RalphIterationEngine.runCliIteration` before CLI execution | invocation total | covered |
| Provider completion | `provider_completed` | `RalphIterationEngine.runCliIteration` after CLI execution | timeline entry | covered |
| Completion-report parse/reconciliation | `completion_report_parsed` | `RalphIterationEngine.runCliIteration` after reconciliation | reducer-only diagnostic event | covered |
| Verifier result | `verifier_result` | `RalphIterationEngine.runCliIteration` from classified verifier results | timeline entry | covered |
| Auto-remediation decision | `remediation_applied` | `RalphIterationEngine.runCliIteration` after remediation coordinator returns | timeline entry and audit trail | covered |
| Artifact persistence | `artifact_written` | `RalphIterationEngine.runCliIteration` after iteration/provenance persistence | artifact totals and artifact list | covered |
| Commit-on-done SCM action | `scm_action` | `RalphIterationEngine.runCliIteration` after commit-on-done coordination | timeline entry and SCM total | covered |
| Run completion | `run_completed` | `RalphIterationEngine.runCliIteration` before state recording | timeline entry, stop reason | covered |
| Review-agent result | `review_result` | `RalphIterationEngine.runCliIteration` for `review` and `reviewer` roles | timeline entry with anomaly count | covered |
| Branch-per-task SCM details | `scm_action` | `reconcileBranchPerTaskScm` returns structured commit/merge/push/PR actions; `RalphIterationEngine.runCliIteration` journals them | timeline entry per action | covered |
| Recovery/crash-resume action | `recovery_applied` | watchdog recovery actions in `RalphIterationEngine.runCliIteration`; operator stale-claim/requeue recovery commands append to the latest run journal when available | timeline entry | covered |
| Workflow/pipeline phase transition | `workflow_phase_completed` | event type exists; full workflow and supervisor phase transitions remain in their own artifacts | reducer total | future |
| Cleanup preview/apply | none | cleanup manifest JSON/Markdown remains the authoritative audit artifact | not projected | intentionally not journaled |
| PRD/backlog reconciliation proposal write | none | proposal JSON/Markdown remains the authoritative audit artifact | not projected | intentionally not journaled |

## Deferred Rationale

- Workflow phase events need emit sites outside the core single-iteration path. They are high-value future work but should be added where those services own the decision, not synthesized from warnings later.
- Cleanup and PRD reconciliation already write dedicated proposal/manifest artifacts that are more useful than a timeline row. Journal events would add noise unless operators need them in the dashboard trust timeline.

## Test Evidence

- `test/eventJournal.test.ts` covers event schema, parsing, writer resume behavior, and reducer behavior.
- `test/runTimeline.test.ts` covers timeline projection for journal events.
- `test/iterationEngine.integration.test.ts` proves successful CLI iterations create a run journal containing run, task, provider, completion-report, verifier, artifact, and completion events.

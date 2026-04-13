# Failure Recovery

This document owns the failure-category taxonomy, recovery playbook dispatch rules, and cost implications of the intelligent failure-recovery system built in phases 1–4.

## Failure Category Taxonomy

Ralph classifies each task failure into one of six categories before selecting a recovery playbook:

| Category | Description |
|---|---|
| `transient` | Temporary infrastructure condition (network timeout, lock contention, process timeout). Classified by pattern match without an LLM call. |
| `implementation_error` | The agent's code change was incorrect or incomplete. Requires a focused retry with tighter constraints. |
| `task_ambiguity` | The task specification is unclear or under-specified. Requires task decomposition or operator clarification. |
| `validation_mismatch` | The implementation is logically sound but fails the validation gate (e.g. wrong command, stale test expectation). |
| `dependency_missing` | A required dependency, file, or external resource is absent. Requires environment setup before retry. |
| `environment_issue` | The agent's execution environment is misconfigured (wrong Node version, missing tool, permission error). Preflight remediation is attempted before retry. |

The category is written to `.ralph/artifacts/<taskId>/failure-analysis.json` after each diagnostic pass.

## Recovery Playbooks

Each category maps to a recovery action:

| Category | Recovery action |
|---|---|
| `transient` | Exponential-backoff retry (1 s, 2 s, 4 s … capped at 30 s). No LLM diagnostic required. |
| `implementation_error` | Retry with the diagnostic summary injected as a `retryPromptAddendum` section in the next iteration prompt. |
| `task_ambiguity` | Emit `decompose_task` remediation proposal so the operator or `autoApplyRemediation` can split the task. |
| `validation_mismatch` | Retry with the failure signature and suggested action injected into the prompt. |
| `dependency_missing` | Retry with the suggested action injected; operator must ensure the dependency is available. |
| `environment_issue` | Attempt preflight remediation; if the environment cannot be repaired, escalate to operator. |

When `autoApplyRemediation` includes the relevant action, Ralph applies it automatically. Otherwise it emits an operator notification and pauses.

When a diagnostic artifact is recorded for the selected task, Ralphdex can surface a focused operator diagnosis workflow:

- `Ralphdex: Open Failure Diagnosis` opens the shared Ralph dashboard on the diagnostics tab, backed by the current task's `failure-analysis.json` and `recovery-state.json`.
- `Ralphdex: Auto-Recover Task` routes through the existing retry/decomposition paths for the selected task.
- `Ralphdex: Skip Task` marks the selected task blocked while preserving the durable failure evidence.

Because the command routes through the same dashboard host as the rest of the operator UI, dismissing the notification toast does not lose the recovery context or create a second diagnosis-specific webview stack.

## Attempt Limits And Escalation

Recovery state is persisted in `.ralph/artifacts/<taskId>/recovery-state.json`. The attempt counter resets when the failure category changes (a new failure type is a fresh start). When `attemptCount` exceeds `ralphCodex.maxRecoveryAttempts`, Ralph escalates to `escalate_to_operator` regardless of category and writes the entry to the dead-letter queue.

## Dead-Letter Queue

Tasks that exhaust recovery attempts land in `.ralph/dead-letter.json`. Use `Ralphdex: Requeue Dead-Letter Task` to reset a task to `todo` and clear its dead-letter entry. The queue is surfaced in `Ralphdex: Show Status` under **Dead-Letter Queue**.

## Failure Chain And Systemic Alert Detection

Ralph maintains a per-run rolling window of failure analyses (keyed by `artifactRootDir`). When three or more distinct tasks accumulate failure analyses with `confidence >= 0.7`, Ralph emits a `SystemicFailureAlert` artifact and signals `pause-all-agents`. This prevents spending additional compute on a systemic problem that requires operator intervention.

## Observability

`Ralphdex: Show Status` surfaces the following recovery fields for the currently selected task:

- **Recovery attempts (current task)** — the `attemptCount` from `recovery-state.json`.
- **Last failure category (current task)** — the `rootCauseCategory` from `failure-analysis.json`.

The **Dead-Letter Queue** section shows per-entry attempt counts and category history.

## Diagnostic Cost

Each LLM-based diagnostic invocation (transient failures are classified by pattern match and incur no LLM cost) runs a short focused prompt against the configured CLI provider. The token cost is recorded in the `diagnosticCost` field of the provenance bundle when available. Transient-path classifications write `diagnosticCost: null`.

Typical diagnostic prompts are under 500 tokens; responses are under 200 tokens. Use `ralphCodex.failureDiagnostics.enabled = false` to disable the diagnostic pass entirely and skip the cost.

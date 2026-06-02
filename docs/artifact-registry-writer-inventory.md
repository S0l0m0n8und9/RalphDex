# Artifact Registry Writer Inventory

The artifact registry at `.ralph/artifacts/index.json` is an additive query index. Artifact files and latest-pointer files remain authoritative; registry write failures must not make an otherwise successful artifact write fail.

## Registered Writers

| Writer | Artifact family | Registry type(s) | Retention |
|---|---|---|---|
| `registerIterationArtifactSet` | iteration prompt, evidence, execution, verifier, result, remediation, diff, doctrine draft | `prompt`, `prompt-evidence`, `execution-plan`, `cli-invocation`, `completion-report`, `iteration-result`, `iteration-summary`, `verifier-summary`, `execution-summary`, `diff-summary`, `task-remediation`, `doctrine-proposal-draft` | `iteration` |
| `registerIterationArtifactSet` | provenance bundle and summary | `provenance-bundle`, `provenance-summary` | `durable` |
| `writeDoctrineProposalArtifact` / `writeUpdatedDoctrineProposalArtifact` | canonical doctrine proposal, markdown summary, latest pointers | `doctrine-proposal`, `doctrine-proposal-summary`, `latest-doctrine-proposal`, `latest-doctrine-proposal-summary` | `durable`, `latest` |
| `writeDoctrineProposalReviewArtifact` | doctrine proposal review artifact and markdown summary | `doctrine-proposal-review`, `doctrine-proposal-review-summary` | `durable` |
| `writeCleanupManifestArtifact` | cleanup manifest JSON and markdown | `cleanup-manifest`, `cleanup-manifest-summary` | `durable` |
| `writeWatchdogDiagnosticArtifact` | watchdog diagnostic JSON | `watchdog-diagnostic` | `iteration` |
| `writePrdReconciliationProposal` | PRD/backlog reconciliation proposal JSON and markdown | `prd-reconciliation`, `prd-reconciliation-summary` | `durable` |
| `writeTaskSeedingArtifact` | task-seeding provider output artifact | `task-seeding` | `durable` |
| `persistLatestPrdReadinessArtifacts` | latest PRD readiness JSON and summary | `latest-prd-readiness`, `latest-prd-readiness-summary` | `latest` |
| `persistTaskGenerationPlanArtifact` | approved/draft task-generation plan latest pointer and history artifact | `latest-task-generation-plan`, `task-generation-plan` | `latest`, `durable` |

## Intentionally Unmanaged

- `.ralph/artifacts/index.json` and `index.json.lock`: registry infrastructure, not registered as content.
- Root latest-pointer files already registered through their writer when they represent a managed artifact family. Latest pointers remain compatibility entry points and are not used as the source of truth for cleanup.
- `.ralph/state.json`, `.ralph/tasks.json`, `.ralph/prd.md`, `.ralph/progress.md`, `.ralph/logs/`, `.ralph/prompts/`, `.ralph/runs/`, `.ralph/handoff/`, and `.ralph/handoffs/`: outside `.ralph/artifacts/index.json` scope. Generated prompt/run files are protected by state/latest-pointer cleanup rules rather than direct registry entries.
- Test fixture writes in `test/`: setup-only files are not production artifact writers.

## Cleanup Notes

Registered `iteration` entries are eligible for generated-artifact cleanup and registry reconciliation drops entries after their files are removed. Registered `durable` entries are retained unless removed by explicit artifact-family cleanup. Registered `latest` entries track compatibility pointers and are reconciled when stale.

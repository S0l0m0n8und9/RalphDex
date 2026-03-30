# Product / project brief

## Objective

Build Ralph into a durable, file-backed multi-agent delivery framework that can move a repository from requirements analysis through implementation, testing, and orchestration without depending on chat memory.

## Product direction

Ralph should let an operator define the work once in `.ralph/`, then execute repeatable Codex-driven iterations that stay inspectable across fresh sessions. The framework needs to strengthen both the quality of agent work and the control plane around it, so each step is deterministic, resumable, and supported by durable evidence.

## Core outcomes

- Turn requirements, progress, and task state into the shared source of truth for all agent activity.
- Support end-to-end delivery flow across requirements analysis, implementation, validation, and orchestration.
- Harden execution with explicit prompts, verifier output, provenance artifacts, and clear stop reasons.
- Keep the architecture thin and repository-backed so operators can audit, resume, and refine work without hidden state.

### Immediate control-plane priority

Before expanding Ralph into broader multi-agent orchestration, harden nested-repo semantics so the system can deterministically answer:

- which root was inspected
- which root was selected as the likely repo
- which root was used for CLI execution
- which root was used for verifier and validation commands
- whether those roots were selected automatically or by explicit override

The system must persist this clearly in prompt evidence, execution plans, provenance bundles, and status surfaces.

### Design intent

Ralph should support multi-repo or umbrella workspaces safely, but remain shallow and deterministic:
- inspect workspace root and immediate child repos only unless explicitly overridden
- persist the chosen inspection root
- define a simple execution-root policy
- allow explicit inspection-root override when ambiguity exists
- keep CLI/provenance trust stronger than IDE-prepared-only handoff

### Nested-repo control-plane milestone — satisfied 2026-03-17

The nested-repo control-plane work that previously blocked multi-agent expansion is complete:

- Chosen inspection, execution, and verifier roots are persisted in prompt evidence, execution plans, provenance bundles, and status surfaces.
- Explicit `ralphCodex.inspectionRootOverride` escape hatch is available for ambiguous umbrella workspaces.
- Root-selection behaviour is covered by regression tests and documented in `docs/` and `AGENTS.md`.

The multi-agent deferral was formally lifted when all three acceptance criteria in `docs/multi-agent-readiness.md` were satisfied:
- Task Ownership: atomic claim acquisition in `taskFile.ts` backed by `.ralph/claims.json`, with preflight stale/contested reporting and reconciliation gating.
- Write Serialisation: `withTaskFileLock` wraps every `tasks.json` mutation path; concurrent-write contention is deterministic.
- Remediation Isolation: `agentId` is a field on `RalphIterationResult`; `countTrailingSameTaskClassifications` is scoped per agent.

### Next delivery horizon

With the control-plane milestone satisfied, the following capabilities are the concrete next targets. Each is grounded in the surface already shipped.

**1. Parallel multi-agent loop execution**

The claim/lock/agentId infrastructure is in place. The next step is running two or more agent loops concurrently against disjoint task sets in the same `.ralph/` workspace. Concrete work:
- A launcher that starts N agent processes and assigns non-overlapping task subsets via the claim mechanism.
- Preflight and Show Status rendering that aggregates health across all active agents.
- Conflict-free SCM orchestration across concurrent branch-per-task agents.

**2. Operator-facing multi-agent health dashboard**

The watchdog agent template, `agents/<agentId>.json` history, and active-claim aggregation in preflight are already present. Concrete work:
- A consolidated Show Multi-Agent Status command that renders per-agent iteration history, claim state, and last-stop reason.
- Watchdog-triggered alerts surfaced as durable diagnostic artifacts (not only in the output channel).
- Stale-claim and repeated-no-progress heatmap so operators can spot stuck agents without reading individual run transcripts.

**3. End-to-end delivery pipeline automation**

The SCM agent, branch-per-task orchestration, review agent, and `scmPrOnParentDone` are in place. Concrete work:
- A top-level pipeline command that accepts a PRD fragment, decomposes it into tasks, runs the agent loop, opens a review-agent pass, and submits a PR — all from a single operator invocation.
- Durable pipeline-run provenance linking PRD input → task graph snapshot → iteration history → PR URL.
- Configurable human-review gates that pause the pipeline and resume on operator approval.
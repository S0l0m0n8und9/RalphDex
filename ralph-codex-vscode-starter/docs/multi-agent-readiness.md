# Multi-Agent Readiness

This document records the acceptance criteria that must be satisfied before Ralph removes the current single-agent loop restriction. Each acceptance criterion stays durable and file-backed.

Related docs:

- [Boundaries](boundaries.md) for the currently enforced single-agent boundary
- [Invariants](invariants.md) for durable control-plane rules
- [Testing](testing.md) for the authoritative validation gate

## Task Ownership

T24 gap: multi-agent work cannot safely progress until task ownership is atomic, durable, and validated before completion state is reconciled.

Acceptance criterion:

- Done only when `src/ralph/taskFile.ts` implements an atomic task-claim mechanism backed by a flat `.ralph/claims.json` schema, `src/ralph/preflight.ts` reports stale and contested claims before execution, and claim validation blocks completion-report reconciliation when the active agent does not hold a valid claim for the selected task.
- Not done if any one of those ownership checks is missing, advisory-only, or enforced outside the durable task-claim record.

## Write Serialisation

T24 gap: multi-agent runs cannot share durable task state until every `tasks.json` mutation path is lock-protected and lock contention is surfaced deterministically.

Acceptance criterion:

- Done only when `withTaskFileLock` wraps every `tasks.json` mutation path in both `src/ralph/taskFile.ts` and `src/ralph/iterationEngine.ts`, lock-timeout contention is surfaced as a preflight warning instead of a silent failure, and regression coverage proves concurrent write contention is handled deterministically.
- Not done if any mutation path bypasses the lock, lock timeout can fail silently, or concurrent-write regression coverage is absent.

## Remediation Isolation

T24 gap: repeated-stop remediation must stay scoped to one agent so interleaved multi-agent history does not create false no-progress signals.

Acceptance criterion:

- Done only when `agentId` is a field on `RalphIterationResult`, `countTrailingSameTaskClassifications` scopes its history window to a single `agentId`, and regression coverage confirms interleaved multi-agent iteration history does not trigger false repeated-stop remediation.
- Not done if iteration history can mix classifications across agents or the regression coverage does not prove that isolation.

## Lifting The Deferral

When all three acceptance criteria above are done and `npm run validate` passes, update `docs/boundaries.md` to remove the single-agent loop restriction and update this document to record the date the milestone was satisfied.

Milestone satisfied date: not yet satisfied.

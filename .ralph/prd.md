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

### Non-goal for now

Do not expand broad multi-agent orchestration until root-selection and execution-root semantics are aligned, tested, and documented.

### Current implementation priority

Complete nested-repo control-plane semantics before broadening multi-agent orchestration.

Near-term sequence:
1. Persist chosen inspection root across prompt evidence, execution plans, provenance bundles, and status surfaces.
2. Define deterministic execution-root and verifier-root policy.
3. Implement explicit override support for ambiguous multi-repo workspaces.
4. Add regression coverage and docs for root-selection behavior.

Broad multi-agent orchestration is deferred until these root semantics are aligned and evidence-backed.
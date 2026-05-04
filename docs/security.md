# Security And Data Handling

This document defines RalphDex security and data-handling expectations for harness use.

Related docs:

- [Boundaries](boundaries.md) for non-goals and trust limits
- [Provenance](provenance.md) for artifact-chain guarantees and epistemic limits
- [Workflows](workflows.md) for operator command flows
- [Dogfooding Runbook](dogfooding-runbook.md) for evidence redaction before sharing

## Scope And Non-Goals

RalphDex is an operator harness, not a formal security product.

- It does not claim formal certification.
- It does not claim provider models or CLIs cannot exfiltrate data.
- It provides deterministic artifacting and explicit trust boundaries so operators can inspect what happened.

## What RalphDex Reads, Writes, Executes, And Sends

### Reads

RalphDex reads local workspace state needed to run loops and verifiers, including:

- `.ralph/prd.md`, `.ralph/tasks.json`, `.ralph/progress.md`, and other runtime files under `.ralph/`
- prompt-template and context inputs from the selected inspection root
- VS Code extension settings under `ralphCodex.*`
- provider auth references (for example environment-variable names and SecretStorage key names)
- secret values only when needed at runtime for configured auth modes (`env-api-key`, `vscode-secret`, `az-bearer`)

### Writes

RalphDex writes durable and runtime artifacts under `.ralph/`, including:

- generated prompts, execution plans, prompt evidence, invocation artifacts, transcripts, summaries, and provenance bundles
- loop runtime state and extension logs
- optional task/decomposition/proposal artifacts through bounded write paths

RalphDex must not intentionally persist raw secret values into workspace files, prompt/provenance artifacts, or extension logs.

### Executes

RalphDex may execute:

- configured provider executables (`codex`, `claude`, `copilot`, `copilot-byok`, `copilot-foundry`, `azure-foundry`, `gemini`)
- VS Code command IDs for IDE handoff (`openSidebarCommandId`, `newChatCommandId`)
- configured validation commands and git inspection commands for verifier passes

### Sends Off-Machine

For provider execution, RalphDex sends prompt payloads and provider request metadata to the selected provider boundary:

- CLI providers: payload sent to the launched third-party CLI process
- `azure-foundry`: payload sent via HTTPS request to the configured endpoint

Treat prompt content as potentially sensitive source data.

## Secret-Handling Boundary

Provider credentials are expected to come from runtime secret sources, not literal workspace settings.

- `azure-foundry` supports `az-bearer`, `env-api-key`, and `vscode-secret`.
- `copilot-byok` and `copilot-foundry` rely on operator-managed BYOK environment credentials.
- `Ralphdex: Set Provider Secret` / `Ralphdex: Clear Provider Secret` write/remove values in VS Code SecretStorage.

Secret-handling rules:

- Secret values should stay in environment variables, bearer-token providers, or SecretStorage.
- Secret values must not be deliberately echoed into docs, logs, transcripts, or provenance files.
- Auth diagnostics may include redacted source labels (for example env var name or secret key name), but not secret values.

## Transcript And Provenance Sensitivity

Execution artifacts can contain sensitive implementation details even when secret values are redacted.

- Stored transcripts are sanitized and size-bounded before persistence.
- Redaction is pattern-based and best-effort; it is not a guarantee that every possible secret format is caught.
- Prompts, last-message artifacts, and completion reports can contain repository content, diagnostics, and model output that should be treated as sensitive.
- Streaming provider output and extension runtime logs should also be treated as sensitive operational data.

Before sharing artifacts externally, apply the redaction guidance in [docs/dogfooding-runbook.md](dogfooding-runbook.md).

## Untrusted Workspace Boundary

RalphDex requires a trusted VS Code workspace for operational commands that write files, launch providers, or run handoff commands. Treat untrusted workspaces as unsupported for normal harness execution.

## Provider And Extension Execution Risks

Running provider CLIs/direct providers introduces third-party execution risk:

- the configured executable path is trusted by the operator and can execute arbitrary process behavior
- child processes may inherit the parent process environment unless explicitly constrained
- provider CLIs/plugins/tools may read workspace files, run subprocesses, and make network calls according to their own runtime behavior and permissions

Operator guidance:

1. Use least-privilege credentials and short-lived tokens where possible.
2. Keep `.ralph/` runtime artifacts out of version control and external sharing by default.
3. Review transcript/provenance artifacts before distribution.
4. Use restrictive provider permission/approval modes unless explicit escalation is required.

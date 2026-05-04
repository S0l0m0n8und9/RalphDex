# Live Provider Dogfooding Runbook

This runbook defines Ralph's opt-in manual dogfooding workflow for live CLI providers. It is intentionally code-grounded and maps each evidence requirement to persisted artifacts.

Live provider calls are never part of CI or automated tests.

Related docs:
- [Workflows](workflows.md) — command flows and provider settings
- [Model Tiering](model-tiering.md) — provider/model routing and fallback behavior
- [Provenance](provenance.md) — trust chain and artifact semantics
- [Boundaries](boundaries.md) — non-goals and trust limits

## Scope And Constraints

- Provider coverage: `codex`, `claude`, `copilot`, `copilot-byok`, `copilot-foundry`, `azure-foundry`, `gemini`
- Dogfooding is manual and operator-driven
- Do not commit secrets or unredacted transcripts
- Do not require Azure setup for a complete dogfooding pass; Azure-backed providers are optional where unavailable
- Do not add live-provider execution to tests

## Provider Matrix (Code-Verified)

| Provider ID | Primary config surface | Command path source | Execution notes |
|---|---|---|---|
| `codex` | `ralphCodex.codexCommandPath`, `ralphCodex.reasoningEffort`, `ralphCodex.sandboxMode`, `ralphCodex.approvalMode` | `ralphCodex.codexCommandPath` | Runs `codex exec` with persisted prompt over stdin |
| `claude` | `ralphCodex.claudeCommandPath`, `ralphCodex.claudeMaxTurns`, `ralphCodex.claudePermissionMode` | `ralphCodex.claudeCommandPath` | Runs `claude -p - --output-format stream-json` |
| `copilot` | `ralphCodex.copilotCommandPath`, `ralphCodex.copilotApprovalMode`, `ralphCodex.copilotMaxAutopilotContinues` | `ralphCodex.copilotCommandPath` | Runs Copilot CLI in autopilot JSON output mode |
| `copilot-byok` | `ralphCodex.copilotFoundry.*` | `ralphCodex.copilotFoundry.commandPath` | Uses Copilot CLI + BYOK env (`COPILOT_PROVIDER_*`) |
| `copilot-foundry` | `ralphCodex.copilotFoundry.*` | `ralphCodex.copilotFoundry.commandPath` | Alias over BYOK provider with provider type forced to `azure` |
| `azure-foundry` | `ralphCodex.azureFoundry.*`, `ralphCodex.promptCaching` | `ralphCodex.azureFoundry.commandPath` | Direct HTTPS provider execution path; invocation args can be empty while command path is still recorded in config/provenance |
| `gemini` | `ralphCodex.geminiCommandPath` | `ralphCodex.geminiCommandPath` | Runs Gemini CLI stream-json path with fixed max-turn behavior in provider code |

## Manual Dogfooding Procedure

1. Run `npm run validate` before starting any live-provider run.
2. Select one low-risk task in `.ralph/tasks.json` for repeatable cross-provider comparison.
3. Configure one provider (`ralphCodex.cliProvider` + provider-specific settings).
4. Confirm the provider command path resolves on your machine (for example `--version` on the configured command where available).
5. Run `Ralphdex: Run CLI Iteration`.
6. Collect evidence artifacts listed in the contract below.
7. Redact evidence before sharing.
8. Repeat for additional providers that are available in your environment.

Recommended ordering for a broad pass:
1. `codex`
2. `claude`
3. `copilot`
4. `gemini`
5. `copilot-byok` and/or `copilot-foundry` (if configured)
6. `azure-foundry` (if configured)

## Evidence Contract

Every manual dogfooding run should produce one structured evidence record.

### Required fields

| Field | Type | Source of truth |
|---|---|---|
| `provider` | `CliProviderId` | `.ralph/artifacts/latest-cli-invocation.json` → `selectedProvider` |
| `model` | `string` | `.ralph/artifacts/latest-cli-invocation.json` → `selectedModel` |
| `reasoningEffort` | `'medium' \| 'high'` | `.ralph/artifacts/latest-cli-invocation.json` → `reasoningEffort` |
| `commandPath` | `string` | `.ralph/artifacts/latest-cli-invocation.json` → `commandPath` |
| `promptEvidencePath` | `string` | `.ralph/artifacts/latest-prompt-evidence.json` path |
| `cliInvocation` | `string` | `commandPath` + `args[]` from `latest-cli-invocation.json` (redacted) |
| `result` | `object` | `.ralph/artifacts/latest-result.json` and iteration `iteration-result.json` |
| `validation` | `object` | iteration `verifier-summary.json` (`validationCommand` result) |
| `warnings` | `string[]` | iteration result warnings and/or verifier warnings |

### Recommended extended fields

Use the `DogfoodEvidenceRecord` contract in `src/ralph/types.ts` for durable consistency, including:
- `dogfoodRunId`
- `timestamp`
- `selectedTaskId`
- `promptPath`
- `executionDurationMs`
- `tokenUsage`
- `exitCode`
- `resultPath`
- `transcriptPath`
- `validationRan`
- `validationResult`
- `blockers`

### Example record

```json
{
  "dogfoodRunId": "dogfood-claude-2026-05-04-001",
  "timestamp": "2026-05-04T02:00:00.000Z",
  "selectedTaskId": "T209",
  "provider": "claude",
  "model": "claude-opus-4-6",
  "reasoningEffort": "high",
  "commandPath": "claude",
  "promptEvidencePath": ".ralph/artifacts/latest-prompt-evidence.json",
  "cliInvocation": "claude -p - --model claude-opus-4-6 --output-format stream-json --max-turns 125",
  "result": {
    "executionStatus": "succeeded",
    "verificationStatus": "passed"
  },
  "validation": {
    "command": "npm run validate",
    "status": "passed"
  },
  "warnings": []
}
```

## Redaction Rules

Ralph already sanitizes stored transcripts (`src/codex/transcriptSafety.ts`) by redacting common token patterns and truncating oversized transcripts. That is not sufficient for external sharing by itself.

Before sharing evidence outside the local workspace, redact:
- API keys, bearer tokens, passwords, and secret-like strings
- Subscription IDs, tenant IDs, internal hostnames, private IPs, and resource names
- Absolute local filesystem paths when they expose user or internal structure
- Customer data, PII, and confidential business context

Safe to share after redaction:
- Provider IDs and model IDs
- Reasoning effort, exit codes, timings, and token counts
- Validation/verifier outcomes
- High-level warnings and blocker categories

## Pass / Fail Criteria

A run passes when all are true:
1. CLI iteration finishes with a terminal result (no hang/stall).
2. Completion report is parseable and reconciled.
3. Required artifacts exist (`latest-prompt-evidence.json`, `latest-cli-invocation.json`, `latest-result.json`, iteration `iteration-result.json`, and verifier summary).
4. Evidence contract required fields are populated and internally consistent.
5. Redaction policy is applied before sharing.
6. `npm run validate` passes before and after the dogfooding session.

A run fails when any are true:
1. Provider launch fails or execution times out/hangs.
2. Completion report is missing/unparseable.
3. Required artifacts are missing or inconsistent.
4. Validation fails.
5. Evidence is incomplete or contains unredacted secrets.

## Session Checklist

```markdown
## Dogfood Session - [provider] - [date]

### Pre-run
- [ ] npm run validate passed
- [ ] Low-risk task selected
- [ ] Provider config set
- [ ] Command path verified

### Execution
- [ ] Ralphdex: Run CLI Iteration executed
- [ ] Iteration terminated cleanly
- [ ] Completion report parsed

### Evidence
- [ ] latest-prompt-evidence.json captured
- [ ] latest-cli-invocation.json captured
- [ ] latest-result.json + iteration-result.json captured
- [ ] verifier-summary.json captured
- [ ] Evidence contract record created

### Share readiness
- [ ] Transcript and artifacts redacted
- [ ] PASS or FAIL recorded with reasons
```

## Storage Convention

Store manual records under `.ralph/artifacts/dogfood-evidence/` using:
- `dogfood-evidence-<provider>-<yyyy-mm-dd>.json`

Do not treat this folder as an automated output contract. It is an operator-maintained collection for manual comparison across providers.

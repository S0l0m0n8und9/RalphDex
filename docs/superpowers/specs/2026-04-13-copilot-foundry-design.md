# Copilot-Foundry Provider Design

> **Superseded** — the copilot-foundry auth approach (RalphDex-owned Azure credential resolution) was removed in the `copilot-byok` refactor (2026-04-25). `copilot-foundry` is now an alias for `copilot-byok` with forced `providerType: azure`. Auth is fully operator-supplied via `COPILOT_PROVIDER_*` env vars. The original design is preserved below for historical reference.

## Context

RalphDex currently supports several CLI/runtime backends:

- `codex`: OpenAI Codex CLI
- `claude`: Anthropic Claude CLI
- `copilot`: GitHub Copilot CLI
- `azure-foundry`: RalphDex direct HTTPS execution against Azure OpenAI / Azure AI Foundry

The current Azure direct provider allows a literal `ralphCodex.azureFoundryApiKey` setting. That creates an unacceptable secret-handling risk because plaintext settings may be committed, copied into shared workspace files, or surfaced accidentally in diagnostics.

Separately, the desired new capability is not "direct Azure inference," but "use Azure OpenAI through a harness that preserves tools, skills, plugins, and Copilot CLI behavior." That means the right boundary is a new Copilot-based provider, not an extension of the existing direct Azure provider and not an overload of the plain `copilot` provider.

## Goals

- Add a new `cliProvider` value: `copilot-foundry`
- Preserve a clean runtime boundary:
  - `copilot`: plain GitHub-routed Copilot CLI
  - `copilot-foundry`: Copilot CLI harness configured to use Azure OpenAI BYOK
  - `azure-foundry`: RalphDex direct HTTPS Azure provider
- Remove plaintext Azure API key storage from RalphDex settings
- Align both Azure-backed providers on the same secure auth model
- Keep Copilot CLI execution semantics, transcript capture, and result extraction unchanged where possible
- Make provider readiness explicit and deterministic

## Non-Goals

- No attempt to merge `copilot`, `copilot-foundry`, and `azure-foundry` into one abstract "Azure" provider
- No support for literal API keys in VS Code settings
- No migration shim that silently continues using `ralphCodex.azureFoundryApiKey`
- No redesign of Ralph prompt shaping, verifier logic, or artifact layout
- No cross-provider generic BYOK abstraction for non-Copilot harnesses in this change

## Provider Boundary

### Recommendation

Introduce `copilot-foundry` as a first-class provider ID.

This provider uses:

- the Copilot CLI as the runtime/harness
- Azure OpenAI as the backing model endpoint
- provider-specific environment shaping to configure Copilot BYOK mode

This keeps boundaries clear:

- `azure-foundry` remains a direct HTTPS provider implemented inside RalphDex
- `copilot-foundry` remains a CLI harness provider with Azure-specific backend configuration
- `copilot` remains the stock GitHub-routed Copilot provider without Azure-specific settings

### Reuse Strategy

Reuse is internal, not user-facing:

- `copilot-foundry` should reuse Copilot CLI argument construction and response extraction logic from the existing Copilot provider where practical
- `copilot-foundry` and `azure-foundry` should share Azure auth-resolution and secret-handling helpers where practical

The operator-facing provider identities stay separate even when implementation details are shared.

## Security Model

### Rule

RalphDex must not accept literal Azure API keys in settings for any Azure-backed provider.

Supported auth modes:

- `az-bearer`
- `env-api-key`
- `vscode-secret`

Rejected auth mode:

- plaintext `apiKey` in configuration

### Required Secret Handling Guarantees

- Secrets are never written to workspace settings
- Secrets are never written into Ralph artifacts
- Secrets are never included in transcripts
- Secrets are never included in status output
- Secrets are never echoed in launch summaries or readiness reports
- Environment shaping for secrets occurs only in the child process environment for the provider invocation

### Hard Break

The existing `ralphCodex.azureFoundryApiKey` setting is removed from the active contract in this change.

Consequences:

- workspaces relying on `ralphCodex.azureFoundryApiKey` will stop working until migrated
- `readConfig` will no longer read it
- configuration contributions will no longer advertise it
- docs will stop referencing it

This is intentional. The old path is unsafe by construction.

## Configuration Contract

### `cliProvider`

Add `copilot-foundry` to the supported `ralphCodex.cliProvider` values.

## `ralphCodex.copilotFoundry`

Add a grouped object setting:

```json
{
  "ralphCodex.copilotFoundry": {
    "commandPath": "copilot",
    "approvalMode": "allow-all",
    "maxAutopilotContinues": 200,
    "auth": {
      "mode": "az-bearer",
      "tenantId": "",
      "subscriptionId": "",
      "apiKeyEnvVar": "",
      "secretStorageKey": ""
    },
    "azure": {
      "resourceGroup": "",
      "resourceName": "",
      "baseUrlOverride": ""
    },
    "model": {
      "deployment": "",
      "wireApi": "responses"
    }
  }
}
```

### Field Semantics

- `commandPath`: path or command name for the Copilot CLI executable used by this provider
- `approvalMode`: same approval posture semantics as the existing Copilot provider
- `maxAutopilotContinues`: same Copilot autopilot limit as the existing Copilot provider
- `auth.mode`:
  - `az-bearer`
  - `env-api-key`
  - `vscode-secret`
- `auth.tenantId`: Azure tenant for `az-bearer`
- `auth.subscriptionId`: Azure subscription for `az-bearer`
- `auth.apiKeyEnvVar`: environment variable name containing the API key for `env-api-key`
- `auth.secretStorageKey`: VS Code SecretStorage lookup key for `vscode-secret`
- `azure.resourceGroup`: Azure resource group name for operator clarity and readiness diagnostics
- `azure.resourceName`: Azure OpenAI resource name used to derive the base URL
- `azure.baseUrlOverride`: optional advanced override; bypasses derived URL construction
- `model.deployment`: Azure deployment name and Copilot model identifier
- `model.wireApi`: defaults to `responses`

### `ralphCodex.azureFoundry`

Replace the current flat Azure direct settings with a grouped object:

```json
{
  "ralphCodex.azureFoundry": {
    "commandPath": "azure-foundry",
    "endpointUrl": "",
    "modelDeployment": "",
    "apiVersion": "2024-12-01-preview",
    "auth": {
      "mode": "az-bearer",
      "tenantId": "",
      "subscriptionId": "",
      "apiKeyEnvVar": "",
      "secretStorageKey": ""
    }
  }
}
```

### Legacy Flat Keys Removed

These are removed from the active contract:

- `ralphCodex.azureFoundryApiKey`
- `ralphCodex.azureFoundryEndpointUrl`
- `ralphCodex.azureFoundryModelDeployment`
- `ralphCodex.azureFoundryApiVersion`
- `ralphCodex.azureFoundryCommandPath`

If a compatibility period is ever needed, it should be implemented later as an explicit migration step. This design does not keep them active.

## Resolution Rules

### `copilot-foundry`

At runtime Ralph resolves configuration in this order:

1. Read `ralphCodex.copilotFoundry`
2. Resolve `commandPath`
3. Resolve Azure base URL:
   - use `azure.baseUrlOverride` when non-empty
   - otherwise derive `https://<resourceName>.openai.azure.com/openai/v1`
4. Resolve auth source:
   - `az-bearer`: acquire token using Azure CLI
   - `env-api-key`: resolve named environment variable
   - `vscode-secret`: resolve from VS Code SecretStorage
5. Shape child environment for Copilot CLI:
   - `COPILOT_PROVIDER_TYPE=openai`
   - `COPILOT_PROVIDER_BASE_URL=<resolved-url>`
   - `COPILOT_MODEL=<deployment>`
   - `COPILOT_PROVIDER_WIRE_API=<wireApi>`
   - one of:
     - `COPILOT_PROVIDER_BEARER_TOKEN=<token>`
     - `COPILOT_PROVIDER_API_KEY=<secret>`
6. Launch Copilot CLI with normal Ralph Copilot runtime flags and transcript capture

### `azure-foundry`

At runtime Ralph resolves configuration in this order:

1. Read `ralphCodex.azureFoundry`
2. Resolve endpoint URL and model deployment
3. Resolve auth source with the same secure auth resolver
4. Call the direct HTTPS provider with:
   - bearer token when `az-bearer`
   - API key from env or SecretStorage when using key-based auth

## Copilot Runtime Contract

### Required Behavior

`copilot-foundry` must preserve the same execution model as the existing `copilot` provider:

- Copilot CLI still runs as the subprocess
- prompts are still piped over stdin
- JSONL output parsing still extracts the final assistant message
- transcript generation still reflects Copilot runtime behavior
- approval mode and autopilot behavior remain Copilot-native settings

### Azure Provider Mode

Use the Azure OpenAI endpoint through Copilot's OpenAI-compatible provider mode, not Copilot's Azure provider mode.

Resolved env contract:

- `COPILOT_PROVIDER_TYPE=openai`
- `COPILOT_PROVIDER_BASE_URL=https://<resource>.openai.azure.com/openai/v1`
- `COPILOT_MODEL=<deployment>`
- `COPILOT_PROVIDER_WIRE_API=responses`

Rationale:

- this matched observed working behavior in the local validation path
- the Azure-specific Copilot provider mode returned a 404 against a valid deployment in the tested CLI/runtime combination

This provider should encode the working runtime contract, not the nominal documentation shape.

## Readiness And Preflight

### `copilot-foundry` checks

Preflight/readiness must validate:

- Copilot CLI executable exists
- `resourceName` or `baseUrlOverride` is configured
- deployment/model is configured
- auth mode is configured and complete
- auth source resolves successfully

Mode-specific checks:

- `az-bearer`
  - `az` exists
  - tenant/subscription are configured
  - `az account get-access-token` succeeds
- `env-api-key`
  - env var name configured
  - env var resolves non-empty
- `vscode-secret`
  - secret storage key configured
  - secret resolves non-empty

Optional active probe:

- run a minimal Copilot non-interactive request against the configured backend
- classify failures clearly as command/auth/provider/deployment issues

### `azure-foundry` checks

Preflight/readiness must validate:

- endpoint URL configured
- model deployment configured
- auth mode is configured and resolves successfully

The old "API key present in settings" path disappears.

## Status Reporting

Status should report:

- provider id
- command path
- Azure target identity
- deployment/model
- auth source type
- auth resolution state

Examples:

- `Provider: copilot-foundry`
- `Azure resource: me-me3mef6a-eastus2`
- `Deployment: gpt-5.4`
- `Auth source: az-bearer`
- `Auth state: resolved`

Status must never report:

- bearer token value
- API key value
- full environment variable contents
- SecretStorage secret contents

## Code Structure

### Type And Config Layer

Update:

- `src/config/types.ts`
- `src/config/defaults.ts`
- `src/config/readConfig.ts`
- `package.json`

Changes:

- add `copilot-foundry` to `CliProviderId`
- add grouped config types for `copilotFoundry`
- replace flat `azureFoundry*` config with grouped `azureFoundry`
- update config reading and normalization

### Provider Layer

Add:

- `src/codex/copilotFoundryCliProvider.ts`
- `src/codex/azureAuthResolver.ts` or equivalent shared helper

Update:

- `src/codex/providerFactory.ts`
- `src/config/providers.ts`

### Shared Helper Responsibilities

Shared Azure auth helper should:

- resolve secure auth mode
- acquire Azure CLI bearer token
- resolve env-based API key
- resolve VS Code SecretStorage secret
- redact error details safely
- return child-env deltas for `copilot-foundry`
- return auth headers or tokens for `azure-foundry`

### SecretStorage Integration

If `vscode-secret` is supported in v1, the extension needs:

- a stable SecretStorage key naming strategy
- one or more commands or UI flows to set/update/delete the secret
- tests that confirm secrets never leak into settings or artifacts

If SecretStorage UI is not added in the same change, the provider may still support it contractually, but operators will need a command surface before the path is usable. The preferred implementation is to add SecretStorage support in the same feature.

## Testing

### Required Coverage

- config parsing for `copilot-foundry`
- config parsing for grouped `azureFoundry`
- hard failure when plaintext Azure API key field is absent from the new contract
- Copilot environment shaping for `copilot-foundry`
- bearer token auth resolution via mocked Azure CLI
- env-var auth resolution
- SecretStorage auth resolution
- transcript generation unchanged for Copilot harness execution
- readiness classification for missing command, missing auth, missing deployment config, and failed token acquisition

### Security Tests

Add explicit assertions that:

- secrets are not copied into transcripts
- secrets are not embedded in warnings/messages
- secrets are not serialized into artifact metadata
- settings round-trips never include literal API key values

## Documentation

Update in the same change:

- `README.md`
- `docs/workflows.md`
- `AGENTS.md` only if routing/index references need to change

Docs must:

- describe the new `copilot-foundry` provider
- document the hard break for plaintext Azure API key settings
- show safe auth examples only
- explain that `copilot-foundry` uses Copilot CLI with Azure OpenAI BYOK
- explain that `azure-foundry` now uses the same secure auth-source model

## Risks

### 1. Copilot CLI provider compatibility drift

Risk:

- Copilot CLI BYOK behavior may change between versions

Mitigation:

- keep readiness probes explicit
- keep `copilot-foundry` env shaping isolated
- document tested runtime assumptions in code comments and docs

### 2. SecretStorage ergonomics

Risk:

- supporting `vscode-secret` without a convenient operator path makes the mode nominally available but awkward

Mitigation:

- add a command/UI surface in the same implementation if feasible

### 3. Hard break fallout

Risk:

- existing `azure-foundry` users will break immediately

Mitigation:

- release notes and docs must call this out clearly
- status/preflight should explain the new secure auth paths directly

## Recommended Implementation Sequence

1. Add new config types and grouped settings contracts
2. Add `copilot-foundry` provider ID and factory wiring
3. Extract shared Azure auth resolver
4. Rework `azure-foundry` to consume the secure auth resolver
5. Implement `copilot-foundry` env shaping and launch flow
6. Add readiness and status reporting
7. Add SecretStorage support if included in scope
8. Update docs
9. Add or update tests for config, readiness, security, and provider behavior

## Acceptance Criteria

- `copilot-foundry` appears as a valid `ralphCodex.cliProvider`
- `copilot-foundry` runs Copilot CLI against Azure OpenAI BYOK with secure auth sources only
- `azure-foundry` no longer supports plaintext API key settings
- both Azure-backed providers support:
  - `az-bearer`
  - `env-api-key`
  - `vscode-secret`
- preflight clearly reports missing or invalid auth configuration
- no secret material appears in settings, artifacts, transcripts, logs, or status
- docs reflect the new provider and the hard security break

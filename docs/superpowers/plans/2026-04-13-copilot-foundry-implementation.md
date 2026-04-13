# Copilot-Foundry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `copilot-foundry` provider that runs GitHub Copilot CLI against Azure OpenAI BYOK, while hardening `azure-foundry` to remove plaintext API key settings and align both Azure-backed providers on secure auth sources only.

**Architecture:** Introduce `copilot-foundry` as a distinct CLI provider that reuses Copilot CLI launch and response parsing semantics but resolves Azure BYOK environment variables at runtime. Extract shared Azure auth resolution into a focused helper used by both `copilot-foundry` and `azure-foundry`, and replace flat Azure settings with grouped, non-secret config contracts read through `readConfig`.

**Tech Stack:** TypeScript, VS Code extension APIs, Node child-process execution, VS Code SecretStorage, Azure CLI (`az`), existing RalphDex provider abstractions and test harness.

---

## File Map

- Create: `src/codex/copilotFoundryCliProvider.ts` for Copilot CLI + Azure BYOK env shaping
- Create: `src/codex/azureAuthResolver.ts` for shared secure auth resolution
- Create: `test/copilotFoundryCliProvider.test.ts` for launch/env behavior
- Create: `test/azureAuthResolver.test.ts` for auth-source behavior
- Modify: `src/config/types.ts`, `src/config/defaults.ts`, `src/config/readConfig.ts`, `src/config/providers.ts`
- Modify: `src/codex/providerFactory.ts`, `src/codex/copilotCliProvider.ts`, `src/codex/azureFoundryProvider.ts`
- Modify: `src/commands/registerCommands.ts`, `src/commands/statusSnapshot.ts`
- Modify: `package.json`, `README.md`, `docs/workflows.md`
- Modify or add tests covering config parsing, provider factory, status, and secret storage behavior

### Task 1: Add provider IDs and grouped config contracts

**Files:**
- Modify: `src/config/types.ts`
- Modify: `src/config/defaults.ts`
- Test: `test/readConfig.test.ts`

- [ ] **Step 1: Write the failing config tests**

Add tests asserting `copilot-foundry` is a valid `cliProvider`, grouped `copilotFoundry` config is parsed, grouped `azureFoundry` config is parsed, and plaintext `azureFoundryApiKey` is no longer part of the returned config object.

- [ ] **Step 2: Run the config test file to verify failure**

Run: `npm run compile:tests`
Run: `node --require ./test/register-vscode-stub.cjs --test ./out-test/test/readConfig.test.js`
Expected: FAIL because grouped provider types and `copilot-foundry` do not exist yet.

- [ ] **Step 3: Add the new config types**

In `src/config/types.ts`, update:

```ts
export type CliProviderId = 'codex' | 'claude' | 'copilot' | 'copilot-foundry' | 'azure-foundry';
```

Add focused grouped config interfaces:

```ts
export type AzureAuthMode = 'az-bearer' | 'env-api-key' | 'vscode-secret';
export interface AzureAuthConfig { mode: AzureAuthMode; tenantId: string; subscriptionId: string; apiKeyEnvVar: string; secretStorageKey: string; }
export interface CopilotFoundryConfig { commandPath: string; approvalMode: CopilotApprovalMode; maxAutopilotContinues: number; auth: AzureAuthConfig; azure: { resourceGroup: string; resourceName: string; baseUrlOverride: string; }; model: { deployment: string; wireApi: string; }; }
export interface AzureFoundryConfig { commandPath: string; endpointUrl: string; modelDeployment: string; apiVersion: string; auth: AzureAuthConfig; }
```

Update `RalphCodexConfig` to include:

```ts
copilotFoundry: CopilotFoundryConfig;
azureFoundry: AzureFoundryConfig;
```

Remove the old flat Azure direct fields from the interface.

- [ ] **Step 4: Add grouped defaults**

In `src/config/defaults.ts`, add `copilotFoundry` and grouped `azureFoundry` defaults with empty secret references and safe defaults such as `auth.mode = 'az-bearer'` and `model.wireApi = 'responses'`.

- [ ] **Step 5: Run the config tests again**

Run: `npm run compile:tests`
Run: `node --require ./test/register-vscode-stub.cjs --test ./out-test/test/readConfig.test.js`
Expected: still FAIL, now because `readConfig` and config contributions still use the old flat Azure contract.

- [ ] **Step 6: Commit**

Run: `git add src/config/types.ts src/config/defaults.ts test/readConfig.test.ts`
Run: `git commit -m "refactor: add secure Azure provider config contracts"`

### Task 2: Parse grouped provider config and remove plaintext Azure key settings

**Files:**
- Modify: `src/config/readConfig.ts`
- Modify: `package.json`
- Test: `test/readConfig.test.ts`

- [ ] **Step 1: Add grouped reader helpers**

In `src/config/readConfig.ts`, add small readers for:

```ts
readAzureAuthConfig(...)
readCopilotFoundryConfig(...)
readAzureFoundryConfig(...)
```

These should normalize strings, enforce allowed `auth.mode` values, and return defaults when nested data is absent or malformed.

- [ ] **Step 2: Replace flat Azure reads**

Update `readConfig(...)` to:

- accept `copilot-foundry` in the allowed provider list
- return `copilotFoundry: readCopilotFoundryConfig(...)`
- return `azureFoundry: readAzureFoundryConfig(...)`
- stop reading:
  - `azureFoundryCommandPath`
  - `azureFoundryEndpointUrl`
  - `azureFoundryApiKey`
  - `azureFoundryModelDeployment`
  - `azureFoundryApiVersion`

- [ ] **Step 3: Update `package.json` contributions**

Change `ralphCodex.cliProvider` enum to include `copilot-foundry`.

Replace flat Azure settings with:

- `ralphCodex.copilotFoundry`
- `ralphCodex.azureFoundry`

Descriptions must explicitly say that literal API keys in settings are not supported.

- [ ] **Step 4: Run the targeted config tests**

Run: `npm run compile:tests`
Run: `node --require ./test/register-vscode-stub.cjs --test ./out-test/test/readConfig.test.js`
Expected: PASS for grouped config parsing and hard-break expectations.

- [ ] **Step 5: Commit**

Run: `git add src/config/readConfig.ts package.json test/readConfig.test.ts`
Run: `git commit -m "refactor: switch Azure providers to grouped secure config"`

### Task 3: Implement shared secure Azure auth resolution

**Files:**
- Create: `src/codex/azureAuthResolver.ts`
- Create: `test/azureAuthResolver.test.ts`

- [ ] **Step 1: Write failing auth-resolution tests**

Cover:

- `env-api-key` resolves from a named env var
- `vscode-secret` resolves from SecretStorage
- `az-bearer` resolves via an injected Azure CLI token resolver
- diagnostics never contain secret values
- missing env var / missing SecretStorage key / missing tenant-subscription combination fail with explicit errors

- [ ] **Step 2: Run the new auth resolver test file**

Run: `npm run compile:tests`
Run: `node --require ./test/register-vscode-stub.cjs --test ./out-test/test/azureAuthResolver.test.js`
Expected: FAIL because the resolver file does not exist yet.

- [ ] **Step 3: Implement `src/codex/azureAuthResolver.ts`**

Create a focused helper with:

```ts
export interface AzureAuthResolution {
  kind: 'api-key' | 'bearer-token';
  secret: string;
  sourceLabel: 'env-api-key' | 'vscode-secret' | 'az-bearer';
  diagnostic: string;
}
```

and:

```ts
resolveAzureAuth(...)
defaultAzBearerTokenResolver(...)
```

The default bearer-token resolver should use `runProcess('az', [...])`, not shell-built commands. Error messages and diagnostics must never contain secrets.

- [ ] **Step 4: Run the auth resolver tests**

Run: `npm run compile:tests`
Run: `node --require ./test/register-vscode-stub.cjs --test ./out-test/test/azureAuthResolver.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/codex/azureAuthResolver.ts test/azureAuthResolver.test.ts`
Run: `git commit -m "feat: add shared secure Azure auth resolver"`

### Task 4: Rework `azure-foundry` to use secure auth only

**Files:**
- Modify: `src/codex/azureFoundryProvider.ts`
- Modify: `src/codex/providerFactory.ts`
- Test: provider factory / Azure provider tests

- [ ] **Step 1: Add a failing provider-factory test**

Add a test that constructs `azure-foundry` from grouped config and confirms the factory returns the right provider without relying on a literal API key field.

- [ ] **Step 2: Run the provider-factory test**

Run: `npm run compile:tests`
Run: `node --require ./test/register-vscode-stub.cjs --test ./out-test/test/providerFactory.test.js`
Expected: FAIL because factory wiring still expects flat Azure fields.

- [ ] **Step 3: Update the factory**

In `src/codex/providerFactory.ts`, replace flat Azure option wiring with:

```ts
return new AzureFoundryProvider({
  endpointUrl: config.azureFoundry.endpointUrl,
  modelDeployment: config.azureFoundry.modelDeployment,
  apiVersion: config.azureFoundry.apiVersion,
  auth: config.azureFoundry.auth,
  promptCaching: config.promptCaching
});
```

- [ ] **Step 4: Update `src/codex/azureFoundryProvider.ts`**

Refactor the provider so it resolves auth through `resolveAzureAuth(...)` at runtime and only sets:

- `headers['api-key'] = ...` for key-based auth
- `headers['Authorization'] = Bearer ...` for bearer-token auth

Warnings may say which auth source is active, but must never include the token or key.

- [ ] **Step 5: Run provider and Azure tests**

Run: `npm run compile:tests`
Run: `npm run test -- --test-name-pattern="azure|providerFactory"`
Expected: PASS for factory wiring and secure auth-source handling.

- [ ] **Step 6: Commit**

Run: `git add src/codex/providerFactory.ts src/codex/azureFoundryProvider.ts test`
Run: `git commit -m "refactor: harden azure-foundry auth sources"`

### Task 5: Implement the `copilot-foundry` provider

**Files:**
- Create: `src/codex/copilotFoundryCliProvider.ts`
- Modify: `src/codex/copilotCliProvider.ts`
- Modify: `src/codex/providerFactory.ts`
- Create: `test/copilotFoundryCliProvider.test.ts`

- [ ] **Step 1: Write failing provider tests**

Cover:

- base URL derives to `https://<resource>.openai.azure.com/openai/v1`
- `baseUrlOverride` wins when set
- child env includes:
  - `COPILOT_PROVIDER_TYPE=openai`
  - `COPILOT_PROVIDER_BASE_URL=...`
  - `COPILOT_MODEL=<deployment>`
  - `COPILOT_PROVIDER_WIRE_API=<wireApi>`
- child env uses exactly one of:
  - `COPILOT_PROVIDER_API_KEY`
  - `COPILOT_PROVIDER_BEARER_TOKEN`
- launch args otherwise match the existing Copilot CLI provider
- secrets do not appear in summaries or transcripts

- [ ] **Step 2: Run the `copilot-foundry` test**

Run: `npm run compile:tests`
Run: `node --require ./test/register-vscode-stub.cjs --test ./out-test/test/copilotFoundryCliProvider.test.js`
Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Extract shared Copilot arg-building if needed**

If necessary, extract a helper from `src/codex/copilotCliProvider.ts` so both Copilot providers can share launch-arg construction without duplicating flags.

- [ ] **Step 4: Implement `src/codex/copilotFoundryCliProvider.ts`**

Create a provider that:

- reuses Copilot CLI launch semantics
- resolves secure auth via `resolveAzureAuth(...)`
- injects Azure BYOK env vars into the child process
- preserves Copilot stdout parsing and transcript shape

If the provider interface needs an async launch-spec path, make the smallest contract change necessary and update only the affected execution path.

- [ ] **Step 5: Wire the provider into `providerFactory.ts`**

Add a `copilot-foundry` branch that builds the new provider from `config.copilotFoundry`.

- [ ] **Step 6: Run the provider tests**

Run: `npm run compile:tests`
Run: `node --require ./test/register-vscode-stub.cjs --test ./out-test/test/copilotFoundryCliProvider.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

Run: `git add src/codex/copilotFoundryCliProvider.ts src/codex/copilotCliProvider.ts src/codex/providerFactory.ts test/copilotFoundryCliProvider.test.ts`
Run: `git commit -m "feat: add copilot-foundry provider"`

### Task 6: Add provider labels, command-path wiring, and readiness/status support

**Files:**
- Modify: `src/config/providers.ts`
- Modify: `src/commands/registerCommands.ts`
- Modify: `src/commands/statusSnapshot.ts`
- Test: status/provider helper tests

- [ ] **Step 1: Add failing status/helper tests**

Add tests confirming:

- `getCliProviderLabel('copilot-foundry') === 'Copilot Foundry'`
- command-path lookup uses `config.copilotFoundry.commandPath`
- status output can surface provider, auth source, Azure resource, deployment, and auth-state without exposing secrets

- [ ] **Step 2: Run the status/helper tests**

Run: `npm run compile:tests`
Run: `npm run test -- --test-name-pattern="status|provider"`
Expected: FAIL because helper functions and status output do not yet know about `copilot-foundry`.

- [ ] **Step 3: Update provider metadata helpers**

In `src/config/providers.ts`:

- map `copilot-foundry` command path to `config.copilotFoundry.commandPath`
- label it `Copilot Foundry`
- use Copilot-like default new-chat behavior

- [ ] **Step 4: Update readiness/status plumbing**

In `registerCommands.ts` and `statusSnapshot.ts`, add provider-specific readiness and status fields for:

- provider id
- auth source type
- auth resolution state
- Azure resource name
- deployment name

Never include secret values.

- [ ] **Step 5: Re-run tests**

Run: `npm run compile:tests`
Run: `npm run test -- --test-name-pattern="status|provider"`
Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add src/config/providers.ts src/commands/registerCommands.ts src/commands/statusSnapshot.ts test`
Run: `git commit -m "feat: add copilot-foundry status and readiness"`

### Task 7: Add VS Code SecretStorage support

**Files:**
- Modify: `src/commands/registerCommands.ts`
- Modify: `package.json`
- Test: secret-storage behavior tests

- [ ] **Step 1: Write failing SecretStorage tests**

Add tests proving:

- a provider secret can be stored in `context.secrets`
- clearing a provider secret removes it
- workspace settings are not used to persist the secret

- [ ] **Step 2: Run the SecretStorage test**

Run: `npm run compile:tests`
Run: `npm run test -- --test-name-pattern="secret"`
Expected: FAIL because no command path exists yet.

- [ ] **Step 3: Add secure commands**

Add commands such as:

- `ralphCodex.setProviderSecret`
- `ralphCodex.clearProviderSecret`

They should write only to `context.secrets` and never to workspace settings. Add matching `package.json` command contributions.

- [ ] **Step 4: Re-run the SecretStorage tests**

Run: `npm run compile:tests`
Run: `npm run test -- --test-name-pattern="secret"`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/commands/registerCommands.ts package.json test`
Run: `git commit -m "feat: add secure provider secret commands"`

### Task 8: Update docs and safe examples

**Files:**
- Modify: `README.md`
- Modify: `docs/workflows.md`
- Modify: `AGENTS.md` only if index text must change

- [ ] **Step 1: Update `README.md`**

Add provider descriptions for:

- `copilot-foundry` as Copilot CLI with Azure OpenAI BYOK
- `azure-foundry` as direct HTTPS Azure provider using secure auth sources only

Use only safe examples that reference env vars, Azure CLI bearer auth, or SecretStorage.

- [ ] **Step 2: Update `docs/workflows.md`**

Replace any plaintext Azure API key guidance with the supported auth-source model:

- `az-bearer`
- `env-api-key`
- `vscode-secret`

Document the `copilot-foundry` runtime contract and note that it uses OpenAI-compatible Azure endpoint wiring for the tested Copilot CLI behavior.

- [ ] **Step 3: Run docs checks**

Run: `npm run check:docs`
Expected: PASS.

- [ ] **Step 4: Commit**

Run: `git add README.md docs/workflows.md AGENTS.md`
Run: `git commit -m "docs: add copilot-foundry and secure Azure auth guidance"`

### Task 9: Full verification

**Files:**
- Modify as needed: any touched files

- [ ] **Step 1: Run compile**

Run: `npm run compile`
Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 4: Run the full validation gate**

Run: `npm run validate`
Expected: PASS.

- [ ] **Step 5: Manual readiness smoke**

Configure a temporary safe `copilot-foundry` settings fixture using env-var or Azure CLI auth, then run:

```text
Ralphdex: Show Status
Ralphdex: Run CLI Iteration
```

Expected:

- readiness reports `copilot-foundry`
- auth source resolves without exposing secrets
- Copilot CLI launch uses Azure OpenAI BYOK env shaping

- [ ] **Step 6: Final commit**

Run: `git add src package.json README.md docs test`
Run: `git commit -m "feat: add copilot-foundry provider and secure Azure auth"`

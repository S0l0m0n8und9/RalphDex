+# Copilot-Foundry Implementation Plan
+
+> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
+
+**Goal:** Add a new `copilot-foundry` provider that runs GitHub Copilot CLI against Azure OpenAI BYOK, while hardening `azure-foundry` to remove plaintext API key settings and align both Azure-backed providers on secure auth sources only.
+
+**Architecture:** Introduce `copilot-foundry` as a distinct CLI provider that reuses Copilot CLI launch and response parsing semantics but resolves Azure BYOK environment variables at runtime. Extract shared Azure auth resolution into a focused helper used by both `copilot-foundry` and `azure-foundry`, and replace flat Azure settings with grouped, non-secret config contracts read through `readConfig`.
+
+**Tech Stack:** TypeScript, VS Code extension APIs, Node child-process execution, VS Code SecretStorage, Azure CLI (`az`), existing RalphDex provider abstractions and test harness.
+
+---
+
+## File Map
+
+### New files
+
+- `src/codex/copilotFoundryCliProvider.ts`
+  Purpose: Copilot CLI provider variant that injects Azure BYOK environment variables into the child process while preserving Copilot CLI runtime behavior.
+- `src/codex/azureAuthResolver.ts`
+  Purpose: Shared helper for Azure auth/source resolution, token acquisition, env-var lookup, SecretStorage lookup, and safe redaction of auth-state diagnostics.
+- `test/copilotFoundryCliProvider.test.ts`
+  Purpose: Validate env shaping, launch behavior, and secret safety for `copilot-foundry`.
+- `test/azureAuthResolver.test.ts`
+  Purpose: Validate secure auth-source resolution, missing-config behavior, and redaction rules.
+
+### Modified files
+
+- `package.json`
+  Purpose: Add `copilot-foundry` provider contribution, replace flat Azure direct settings with grouped objects, and remove plaintext Azure API key contribution.
+- `src/config/types.ts`
+  Purpose: Add provider ID, grouped config interfaces, and auth mode/source types.
+- `src/config/defaults.ts`
+  Purpose: Seed defaults for grouped `copilotFoundry` and grouped `azureFoundry` configs.
+- `src/config/readConfig.ts`
+  Purpose: Parse grouped provider settings and remove support for literal Azure API key settings.
+- `src/config/providers.ts`
+  Purpose: Add provider label/command-path/default command mapping for `copilot-foundry`.
+- `src/codex/providerFactory.ts`
+  Purpose: Construct `copilot-foundry` provider and pass shared config/auth dependencies.
+- `src/codex/copilotCliProvider.ts`
+  Purpose: If needed, extract shared Copilot argument-building helpers to avoid duplication.
+- `src/codex/azureFoundryProvider.ts`
+  Purpose: Replace direct plaintext API key dependency with secure auth resolution.
+- `src/commands/registerCommands.ts`
+  Purpose: Ensure readiness/testing flows can classify and surface `copilot-foundry`.
+- `src/commands/statusSnapshot.ts`
+  Purpose: Include grouped provider config state in status snapshots.
+- `docs/workflows.md`
+  Purpose: Document `copilot-foundry` runtime semantics and secure auth requirements for both Azure-backed providers.
+- `README.md`
+  Purpose: Update provider overview and safe configuration examples.
+
+### Existing tests likely to update
+
+- `test/readConfig.test.ts`
+  Purpose: Cover grouped config parsing and hard-break removal of plaintext Azure API key support.
+- `test/providerFactory.test.ts` if present, otherwise create focused provider-factory coverage
+  Purpose: Ensure correct provider instantiation for `copilot-foundry`.
+
+## Task 1: Add provider IDs and grouped config types
+
+**Files:**
+- Modify: `src/config/types.ts`
+- Modify: `src/config/defaults.ts`
+- Test: `test/readConfig.test.ts`
+
+- [ ] **Step 1: Add the failing config-type expectations**
+
+Append a focused test block in `test/readConfig.test.ts` that asserts:
+
+```ts
+test('readConfig parses grouped copilotFoundry config and new cliProvider', () => {
+  mockConfiguration({
+    cliProvider: 'copilot-foundry',
+    copilotFoundry: {
+      commandPath: 'copilot',
+      approvalMode: 'allow-all',
+      maxAutopilotContinues: 200,
+      auth: {
+        mode: 'az-bearer',
+        tenantId: 'tenant-1',
+        subscriptionId: 'sub-1'
+      },
+      azure: {
+        resourceGroup: 'rg-1',
+        resourceName: 'resource-1'
+      },
+      model: {
+        deployment: 'gpt-5.4',
+        wireApi: 'responses'
+      }
+    }
+  });
+
+  const config = readConfig(workspaceFolder('C:\\repo'));
+
+  assert.equal(config.cliProvider, 'copilot-foundry');
+  assert.equal(config.copilotFoundry.auth.mode, 'az-bearer');
+  assert.equal(config.copilotFoundry.azure.resourceName, 'resource-1');
+  assert.equal(config.copilotFoundry.model.deployment, 'gpt-5.4');
+});
+
+test('readConfig does not expose plaintext azureFoundryApiKey', () => {
+  mockConfiguration({
+    azureFoundryApiKey: 'should-not-be-read',
+    azureFoundry: {
+      endpointUrl: 'https://example.openai.azure.com/',
+      modelDeployment: 'gpt-5.4',
+      auth: {
+        mode: 'env-api-key',
+        apiKeyEnvVar: 'AZURE_OPENAI_API_KEY'
+      }
+    }
+  });
+
+  const config = readConfig(workspaceFolder('C:\\repo'));
+
+  assert.equal('azureFoundryApiKey' in config, false);
+  assert.equal(config.azureFoundry.auth.mode, 'env-api-key');
+});
+```
+
+- [ ] **Step 2: Run the targeted config test file and confirm it fails**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/readConfig.test.js
+```
+
+Expected:
+
+- FAIL because `copilot-foundry` and grouped provider config types do not exist yet
+
+- [ ] **Step 3: Define the new config contracts in `src/config/types.ts`**
+
+Add provider IDs and grouped config interfaces similar to:
+
+```ts
+export type CliProviderId = 'codex' | 'claude' | 'copilot' | 'copilot-foundry' | 'azure-foundry';
+
+export type AzureAuthMode = 'az-bearer' | 'env-api-key' | 'vscode-secret';
+
+export interface AzureAuthConfig {
+  mode: AzureAuthMode;
+  tenantId: string;
+  subscriptionId: string;
+  apiKeyEnvVar: string;
+  secretStorageKey: string;
+}
+
+export interface CopilotFoundryConfig {
+  commandPath: string;
+  approvalMode: CopilotApprovalMode;
+  maxAutopilotContinues: number;
+  auth: AzureAuthConfig;
+  azure: {
+    resourceGroup: string;
+    resourceName: string;
+    baseUrlOverride: string;
+  };
+  model: {
+    deployment: string;
+    wireApi: string;
+  };
+}
+
+export interface AzureFoundryConfig {
+  commandPath: string;
+  endpointUrl: string;
+  modelDeployment: string;
+  apiVersion: string;
+  auth: AzureAuthConfig;
+}
+```
+
+Update `RalphCodexConfig` to include:
+
+```ts
+copilotFoundry: CopilotFoundryConfig;
+azureFoundry: AzureFoundryConfig;
+```
+
+and remove:
+
+```ts
+azureFoundryCommandPath: string;
+azureFoundryEndpointUrl: string;
+azureFoundryApiKey: string;
+azureFoundryModelDeployment: string;
+azureFoundryApiVersion: string;
+```
+
+- [ ] **Step 4: Add grouped defaults in `src/config/defaults.ts`**
+
+Define minimal safe defaults:
+
+```ts
+copilotFoundry: {
+  commandPath: 'copilot',
+  approvalMode: 'allow-all',
+  maxAutopilotContinues: 200,
+  auth: {
+    mode: 'az-bearer',
+    tenantId: '',
+    subscriptionId: '',
+    apiKeyEnvVar: '',
+    secretStorageKey: ''
+  },
+  azure: {
+    resourceGroup: '',
+    resourceName: '',
+    baseUrlOverride: ''
+  },
+  model: {
+    deployment: '',
+    wireApi: 'responses'
+  }
+},
+azureFoundry: {
+  commandPath: 'azure-foundry',
+  endpointUrl: '',
+  modelDeployment: '',
+  apiVersion: '2024-12-01-preview',
+  auth: {
+    mode: 'az-bearer',
+    tenantId: '',
+    subscriptionId: '',
+    apiKeyEnvVar: '',
+    secretStorageKey: ''
+  }
+},
+```
+
+- [ ] **Step 5: Re-run the targeted config test**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/readConfig.test.js
+```
+
+Expected:
+
+- Tests still fail, but now on config parsing because `readConfig` has not yet been updated
+
+- [ ] **Step 6: Commit the type/default contract**
+
+```bash
+git add src/config/types.ts src/config/defaults.ts test/readConfig.test.ts
+git commit -m "refactor: add secure Azure provider config contracts"
+```
+
+## Task 2: Parse grouped config and remove plaintext Azure key support
+
+**Files:**
+- Modify: `src/config/readConfig.ts`
+- Modify: `package.json`
+- Test: `test/readConfig.test.ts`
+
+- [ ] **Step 1: Add the failing settings-contribution expectation**
+
+Add a test that asserts the new provider ID is accepted and grouped configs are returned with defaults when omitted:
+
+```ts
+test('readConfig returns grouped provider defaults for copilotFoundry and azureFoundry', () => {
+  mockConfiguration({});
+
+  const config = readConfig(workspaceFolder('C:\\repo'));
+
+  assert.equal(config.copilotFoundry.commandPath, 'copilot');
+  assert.equal(config.copilotFoundry.auth.mode, 'az-bearer');
+  assert.equal(config.azureFoundry.commandPath, 'azure-foundry');
+  assert.equal(config.azureFoundry.auth.mode, 'az-bearer');
+});
+```
+
+- [ ] **Step 2: Run the test and verify parsing still fails**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/readConfig.test.js
+```
+
+Expected:
+
+- FAIL because `readConfig` still reads flat Azure fields and does not understand `copilot-foundry`
+
+- [ ] **Step 3: Refactor `src/config/readConfig.ts` to read grouped provider objects**
+
+Add focused helpers such as:
+
+```ts
+function readAzureAuthConfig(raw: unknown, fallback: AzureAuthConfig): AzureAuthConfig {
+  const record = raw && typeof raw === 'object' && !Array.isArray(raw)
+    ? raw as Record<string, unknown>
+    : {};
+
+  const mode = typeof record.mode === 'string'
+    && ['az-bearer', 'env-api-key', 'vscode-secret'].includes(record.mode)
+      ? record.mode as AzureAuthMode
+      : fallback.mode;
+
+  return {
+    mode,
+    tenantId: typeof record.tenantId === 'string' ? record.tenantId.trim() : fallback.tenantId,
+    subscriptionId: typeof record.subscriptionId === 'string' ? record.subscriptionId.trim() : fallback.subscriptionId,
+    apiKeyEnvVar: typeof record.apiKeyEnvVar === 'string' ? record.apiKeyEnvVar.trim() : fallback.apiKeyEnvVar,
+    secretStorageKey: typeof record.secretStorageKey === 'string' ? record.secretStorageKey.trim() : fallback.secretStorageKey
+  };
+}
+```
+
+and grouped readers:
+
+```ts
+function readCopilotFoundryConfig(
+  config: vscode.WorkspaceConfiguration,
+  fallback: CopilotFoundryConfig
+): CopilotFoundryConfig { /* normalize nested object */ }
+
+function readAzureFoundryConfig(
+  config: vscode.WorkspaceConfiguration,
+  fallback: AzureFoundryConfig
+): AzureFoundryConfig { /* normalize nested object */ }
+```
+
+Update the returned config object to use:
+
+```ts
+copilotFoundry: readCopilotFoundryConfig(config, DEFAULT_CONFIG.copilotFoundry),
+azureFoundry: readAzureFoundryConfig(config, DEFAULT_CONFIG.azureFoundry),
+```
+
+and remove all reads of:
+
+```ts
+azureFoundryCommandPath
+azureFoundryEndpointUrl
+azureFoundryApiKey
+azureFoundryModelDeployment
+azureFoundryApiVersion
+```
+
+Also extend the allowed provider enum list to include:
+
+```ts
+const CLI_PROVIDER_IDS: readonly CliProviderId[] = ['codex', 'claude', 'copilot', 'copilot-foundry', 'azure-foundry'];
+```
+
+- [ ] **Step 4: Update `package.json` configuration contributions**
+
+Replace the flat Azure provider contributions with grouped object contributions and add `copilot-foundry` to the `cliProvider` enum.
+
+The relevant `cliProvider` fragment should become:
+
+```json
+"ralphCodex.cliProvider": {
+  "type": "string",
+  "enum": [
+    "codex",
+    "claude",
+    "copilot",
+    "copilot-foundry",
+    "azure-foundry"
+  ],
+  "default": "claude",
+  "description": "Which CLI backend to use for scripted iterations. 'copilot-foundry' uses GitHub Copilot CLI configured for Azure OpenAI BYOK, while 'azure-foundry' uses RalphDex direct HTTPS execution against Azure."
+}
+```
+
+Replace the flat Azure properties with:
+
+```json
+"ralphCodex.copilotFoundry": {
+  "type": "object",
+  "default": {
+    "commandPath": "copilot",
+    "approvalMode": "allow-all",
+    "maxAutopilotContinues": 200,
+    "auth": {
+      "mode": "az-bearer",
+      "tenantId": "",
+      "subscriptionId": "",
+      "apiKeyEnvVar": "",
+      "secretStorageKey": ""
+    },
+    "azure": {
+      "resourceGroup": "",
+      "resourceName": "",
+      "baseUrlOverride": ""
+    },
+    "model": {
+      "deployment": "",
+      "wireApi": "responses"
+    }
+  },
+  "description": "GitHub Copilot CLI configured to use Azure OpenAI BYOK. Secrets must come from Azure CLI, an environment variable, or VS Code SecretStorage."
+}
+```
+
+and:
+
+```json
+"ralphCodex.azureFoundry": {
+  "type": "object",
+  "default": {
+    "commandPath": "azure-foundry",
+    "endpointUrl": "",
+    "modelDeployment": "",
+    "apiVersion": "2024-12-01-preview",
+    "auth": {
+      "mode": "az-bearer",
+      "tenantId": "",
+      "subscriptionId": "",
+      "apiKeyEnvVar": "",
+      "secretStorageKey": ""
+    }
+  },
+  "description": "Direct Azure HTTPS provider configuration. Literal API keys in settings are not supported."
+}
+```
+
+- [ ] **Step 5: Run config tests again**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/readConfig.test.js
+```
+
+Expected:
+
+- PASS for grouped config parsing tests
+
+- [ ] **Step 6: Commit the config parsing change**
+
+```bash
+git add src/config/readConfig.ts package.json test/readConfig.test.ts
+git commit -m "refactor: switch Azure providers to grouped secure config"
+```
+
+## Task 3: Add shared Azure auth resolution
+
+**Files:**
+- Create: `src/codex/azureAuthResolver.ts`
+- Create: `test/azureAuthResolver.test.ts`
+- Modify: `src/config/types.ts`
+
+- [ ] **Step 1: Write failing auth-resolution tests**
+
+Create `test/azureAuthResolver.test.ts` with cases like:
+
+```ts
+test('resolveAzureAuth returns env api key without exposing the secret in diagnostics', async () => {
+  process.env.AZURE_OPENAI_API_KEY = 'super-secret';
+
+  const result = await resolveAzureAuth(
+    {
+      mode: 'env-api-key',
+      tenantId: '',
+      subscriptionId: '',
+      apiKeyEnvVar: 'AZURE_OPENAI_API_KEY',
+      secretStorageKey: ''
+    },
+    createSecretStorageStub({})
+  );
+
+  assert.equal(result.kind, 'api-key');
+  assert.equal(result.secret, 'super-secret');
+  assert.equal(result.diagnostic.includes('super-secret'), false);
+});
+
+test('resolveAzureAuth returns bearer token via injected az executor', async () => {
+  const result = await resolveAzureAuth(
+    {
+      mode: 'az-bearer',
+      tenantId: 'tenant-1',
+      subscriptionId: 'sub-1',
+      apiKeyEnvVar: '',
+      secretStorageKey: ''
+    },
+    createSecretStorageStub({}),
+    async () => 'bearer-token'
+  );
+
+  assert.equal(result.kind, 'bearer-token');
+  assert.equal(result.secret, 'bearer-token');
+});
+```
+
+- [ ] **Step 2: Run the new test file and confirm it fails**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/azureAuthResolver.test.js
+```
+
+Expected:
+
+- FAIL because `azureAuthResolver.ts` does not exist yet
+
+- [ ] **Step 3: Implement `src/codex/azureAuthResolver.ts`**
+
+Create a focused helper shaped roughly like:
+
+```ts
+export interface AzureAuthResolution {
+  kind: 'api-key' | 'bearer-token';
+  secret: string;
+  sourceLabel: 'env-api-key' | 'vscode-secret' | 'az-bearer';
+  diagnostic: string;
+}
+
+export async function resolveAzureAuth(
+  auth: AzureAuthConfig,
+  secretStorage: vscode.SecretStorage,
+  getBearerToken: (tenantId: string, subscriptionId: string) => Promise<string> = defaultAzBearerTokenResolver
+): Promise<AzureAuthResolution> {
+  switch (auth.mode) {
+    case 'env-api-key': {
+      const value = process.env[auth.apiKeyEnvVar];
+      if (!value) {
+        throw new Error(`Environment variable ${auth.apiKeyEnvVar} is not set.`);
+      }
+      return {
+        kind: 'api-key',
+        secret: value,
+        sourceLabel: 'env-api-key',
+        diagnostic: `API key resolved from environment variable ${auth.apiKeyEnvVar}.`
+      };
+    }
+    case 'vscode-secret': {
+      const value = await secretStorage.get(auth.secretStorageKey);
+      if (!value) {
+        throw new Error(`VS Code secret ${auth.secretStorageKey} was not found.`);
+      }
+      return {
+        kind: 'api-key',
+        secret: value,
+        sourceLabel: 'vscode-secret',
+        diagnostic: `API key resolved from VS Code SecretStorage key ${auth.secretStorageKey}.`
+      };
+    }
+    default: {
+      const token = await getBearerToken(auth.tenantId, auth.subscriptionId);
+      if (!token) {
+        throw new Error('Azure CLI returned an empty bearer token.');
+      }
+      return {
+        kind: 'bearer-token',
+        secret: token,
+        sourceLabel: 'az-bearer',
+        diagnostic: `Bearer token resolved via Azure CLI for subscription ${auth.subscriptionId}.`
+      };
+    }
+  }
+}
+```
+
+Implement the default bearer resolver with `runProcess('az', ...)` rather than shell string concatenation, and keep thrown errors free of secret values.
+
+- [ ] **Step 4: Run the auth resolver tests**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/azureAuthResolver.test.js
+```
+
+Expected:
+
+- PASS
+
+- [ ] **Step 5: Commit the shared auth helper**
+
+```bash
+git add src/codex/azureAuthResolver.ts test/azureAuthResolver.test.ts src/config/types.ts
+git commit -m "feat: add shared secure Azure auth resolver"
+```
+
+## Task 4: Rework `azure-foundry` to use secure auth sources only
+
+**Files:**
+- Modify: `src/codex/azureFoundryProvider.ts`
+- Modify: `src/codex/providerFactory.ts`
+- Test: `test/providerFactory.test.ts`
+
+- [ ] **Step 1: Add a failing provider-factory test for grouped Azure direct config**
+
+If no factory test file exists, create one. Add a case like:
+
+```ts
+test('createCliProviderForId returns AzureFoundryProvider with grouped secure auth config', () => {
+  const provider = createCliProviderForId('azure-foundry', {
+    ...DEFAULT_CONFIG,
+    cliProvider: 'azure-foundry',
+    azureFoundry: {
+      commandPath: 'azure-foundry',
+      endpointUrl: 'https://resource.openai.azure.com/',
+      modelDeployment: 'gpt-5.4',
+      apiVersion: '2024-12-01-preview',
+      auth: {
+        mode: 'env-api-key',
+        tenantId: '',
+        subscriptionId: '',
+        apiKeyEnvVar: 'AZURE_OPENAI_API_KEY',
+        secretStorageKey: ''
+      }
+    }
+  });
+
+  assert.equal(provider.id, 'azure-foundry');
+});
+```
+
+- [ ] **Step 2: Run the provider-factory test and confirm it fails**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/providerFactory.test.js
+```
+
+Expected:
+
+- FAIL because factory wiring still expects flat Azure fields
+
+- [ ] **Step 3: Update `src/codex/providerFactory.ts`**
+
+Change the Azure provider construction from flat fields:
+
+```ts
+return new AzureFoundryProvider({
+  endpointUrl: config.azureFoundryEndpointUrl,
+  apiKey: config.azureFoundryApiKey,
+  modelDeployment: config.azureFoundryModelDeployment,
+  apiVersion: config.azureFoundryApiVersion,
+  promptCaching: config.promptCaching
+});
+```
+
+to grouped config:
+
+```ts
+return new AzureFoundryProvider({
+  endpointUrl: config.azureFoundry.endpointUrl,
+  modelDeployment: config.azureFoundry.modelDeployment,
+  apiVersion: config.azureFoundry.apiVersion,
+  auth: config.azureFoundry.auth,
+  promptCaching: config.promptCaching
+});
+```
+
+- [ ] **Step 4: Refactor `src/codex/azureFoundryProvider.ts` to resolve auth at runtime**
+
+Replace direct `apiKey` usage with the shared resolver. The constructor shape should become:
+
+```ts
+export interface AzureFoundryProviderOptions {
+  endpointUrl: string;
+  modelDeployment?: string;
+  apiVersion?: string;
+  promptCaching?: PromptCachingMode;
+  auth: AzureAuthConfig;
+  credential?: TokenCredentialLike;
+}
+```
+
+Inside direct execution and summarization:
+
+```ts
+const resolution = await resolveAzureAuth(this.options.auth, this.secretStorage, this.getBearerToken);
+if (resolution.kind === 'api-key') {
+  headers['api-key'] = resolution.secret;
+} else {
+  headers['Authorization'] = `Bearer ${resolution.secret}`;
+}
+warnings.push(`Using ${resolution.sourceLabel} authentication.`);
+```
+
+Ensure warnings do not include secret content.
+
+- [ ] **Step 5: Re-run provider-factory and related Azure tests**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/providerFactory.test.js
+npm run test -- --test-name-pattern="azure"
+```
+
+Expected:
+
+- PASS for factory wiring
+- PASS for Azure direct provider auth paths or failing tests updated accordingly
+
+- [ ] **Step 6: Commit the secure Azure direct-provider change**
+
+```bash
+git add src/codex/providerFactory.ts src/codex/azureFoundryProvider.ts test/providerFactory.test.ts
+git commit -m "refactor: harden azure-foundry auth sources"
+```
+
+## Task 5: Implement `copilot-foundry` provider
+
+**Files:**
+- Create: `src/codex/copilotFoundryCliProvider.ts`
+- Modify: `src/codex/copilotCliProvider.ts`
+- Modify: `src/codex/providerFactory.ts`
+- Create: `test/copilotFoundryCliProvider.test.ts`
+
+- [ ] **Step 1: Write failing launch/env tests for `copilot-foundry`**
+
+Create `test/copilotFoundryCliProvider.test.ts` with cases like:
+
+```ts
+test('copilot-foundry derives Azure OpenAI base URL and injects BYOK env vars', async () => {
+  const provider = new CopilotFoundryCliProvider(
+    {
+      approvalMode: 'allow-all',
+      maxAutopilotContinues: 200,
+      auth: {
+        mode: 'env-api-key',
+        tenantId: '',
+        subscriptionId: '',
+        apiKeyEnvVar: 'AZURE_OPENAI_API_KEY',
+        secretStorageKey: ''
+      },
+      azure: {
+        resourceGroup: 'azureai',
+        resourceName: 'me-me3mef6a-eastus2',
+        baseUrlOverride: ''
+      },
+      model: {
+        deployment: 'gpt-5.4',
+        wireApi: 'responses'
+      }
+    },
+    secretStorageStub,
+    async () => ({
+      kind: 'api-key',
+      secret: 'super-secret',
+      sourceLabel: 'env-api-key',
+      diagnostic: 'API key resolved from environment variable AZURE_OPENAI_API_KEY.'
+    })
+  );
+
+  const spec = await provider.buildLaunchSpecAsync(request);
+
+  assert.equal(spec.env?.COPILOT_PROVIDER_TYPE, 'openai');
+  assert.equal(spec.env?.COPILOT_PROVIDER_BASE_URL, 'https://me-me3mef6a-eastus2.openai.azure.com/openai/v1');
+  assert.equal(spec.env?.COPILOT_MODEL, 'gpt-5.4');
+  assert.equal(spec.env?.COPILOT_PROVIDER_WIRE_API, 'responses');
+  assert.equal(spec.env?.COPILOT_PROVIDER_API_KEY, 'super-secret');
+});
+```
+
+- [ ] **Step 2: Run the test and confirm it fails**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/copilotFoundryCliProvider.test.js
+```
+
+Expected:
+
+- FAIL because the provider does not exist yet
+
+- [ ] **Step 3: Add `src/codex/copilotFoundryCliProvider.ts`**
+
+Implement a provider that mirrors Copilot CLI launch behavior but adds resolved child env vars:
+
+```ts
+export class CopilotFoundryCliProvider implements CliProvider {
+  public readonly id = 'copilot-foundry' as const;
+
+  public async buildLaunchSpecAsync(request: CodexExecRequest): Promise<CliLaunchSpec> {
+    const auth = await resolveAzureAuth(this.options.auth, this.secretStorage, this.getBearerToken);
+    const baseUrl = this.options.azure.baseUrlOverride.trim()
+      || `https://${this.options.azure.resourceName}.openai.azure.com/openai/v1`;
+
+    const env: NodeJS.ProcessEnv = {
+      COPILOT_PROVIDER_TYPE: 'openai',
+      COPILOT_PROVIDER_BASE_URL: baseUrl,
+      COPILOT_MODEL: this.options.model.deployment,
+      COPILOT_PROVIDER_WIRE_API: this.options.model.wireApi
+    };
+
+    if (auth.kind === 'api-key') {
+      env.COPILOT_PROVIDER_API_KEY = auth.secret;
+    } else {
+      env.COPILOT_PROVIDER_BEARER_TOKEN = auth.secret;
+    }
+
+    return {
+      args: buildCopilotArgs(request, this.options.approvalMode, this.options.maxAutopilotContinues),
+      cwd: request.executionRoot,
+      stdinText: request.prompt,
+      shell: process.platform === 'win32',
+      env
+    };
+  }
+}
+```
+
+If the `CliProvider` interface is synchronous today, introduce the minimum contract change needed so provider launch specs can be resolved asynchronously without duplicating the whole execution pipeline incorrectly.
+
+- [ ] **Step 4: Extract shared Copilot CLI arg-building if needed**
+
+If `CopilotCliProvider` and `CopilotFoundryCliProvider` would duplicate launch flags, extract a helper from `src/codex/copilotCliProvider.ts`, for example:
+
+```ts
+export function buildCopilotArgs(
+  request: CodexExecRequest,
+  approvalMode: CopilotApprovalMode,
+  maxAutopilotContinues: number
+): string[] { /* existing logic */ }
+```
+
+Keep response extraction and transcript generation behavior aligned with the existing Copilot provider.
+
+- [ ] **Step 5: Wire `copilot-foundry` into `providerFactory.ts`**
+
+Add:
+
+```ts
+if (providerId === 'copilot-foundry') {
+  return new CopilotFoundryCliProvider({
+    approvalMode: config.copilotFoundry.approvalMode,
+    maxAutopilotContinues: config.copilotFoundry.maxAutopilotContinues,
+    auth: config.copilotFoundry.auth,
+    azure: config.copilotFoundry.azure,
+    model: config.copilotFoundry.model
+  });
+}
+```
+
+- [ ] **Step 6: Run the `copilot-foundry` tests**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/copilotFoundryCliProvider.test.js
+```
+
+Expected:
+
+- PASS
+
+- [ ] **Step 7: Commit the new provider**
+
+```bash
+git add src/codex/copilotFoundryCliProvider.ts src/codex/copilotCliProvider.ts src/codex/providerFactory.ts test/copilotFoundryCliProvider.test.ts
+git commit -m "feat: add copilot-foundry provider"
+```
+
+## Task 6: Surface provider labels, command paths, and status integration
+
+**Files:**
+- Modify: `src/config/providers.ts`
+- Modify: `src/commands/registerCommands.ts`
+- Modify: `src/commands/statusSnapshot.ts`
+- Test: `test/statusSnapshot.test.ts`
+
+- [ ] **Step 1: Write a failing status/provider-label test**
+
+Add a test asserting:
+
+```ts
+test('getCliProviderLabel returns Copilot Foundry for copilot-foundry', () => {
+  assert.equal(getCliProviderLabel('copilot-foundry'), 'Copilot Foundry');
+});
+```
+
+and a status-snapshot case that verifies provider-specific readiness content can surface grouped auth source state.
+
+- [ ] **Step 2: Run the test and confirm it fails**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/statusSnapshot.test.js
+```
+
+Expected:
+
+- FAIL because `copilot-foundry` is not yet recognized in provider label/path helpers or status output
+
+- [ ] **Step 3: Update `src/config/providers.ts`**
+
+Add:
+
+```ts
+case 'copilot-foundry':
+  return config.copilotFoundry.commandPath;
+```
+
+and:
+
+```ts
+case 'copilot-foundry':
+  return 'Copilot Foundry';
+```
+
+Use the Copilot new-chat default unless a more specific command exists:
+
+```ts
+case 'copilot-foundry':
+  return 'github.copilot.cli.newSession';
+```
+
+- [ ] **Step 4: Update readiness/status plumbing**
+
+In `registerCommands.ts` and `statusSnapshot.ts`, ensure provider readiness and status snapshots can emit:
+
+```ts
+provider: 'copilot-foundry',
+authSource: 'az-bearer',
+authState: 'resolved',
+resourceName: 'me-me3mef6a-eastus2',
+deployment: 'gpt-5.4'
+```
+
+without exposing any secret values.
+
+- [ ] **Step 5: Re-run the provider/status tests**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/statusSnapshot.test.js
+```
+
+Expected:
+
+- PASS
+
+- [ ] **Step 6: Commit the provider/status integration**
+
+```bash
+git add src/config/providers.ts src/commands/registerCommands.ts src/commands/statusSnapshot.ts test/statusSnapshot.test.ts
+git commit -m "feat: add copilot-foundry status and provider metadata"
+```
+
+## Task 7: Add SecretStorage support and secure commands
+
+**Files:**
+- Modify: `src/commands/registerCommands.ts`
+- Modify: `package.json`
+- Test: `test/secretStorage.test.ts`
+
+- [ ] **Step 1: Write the failing secret-storage behavior test**
+
+Create or extend a test file with something like:
+
+```ts
+test('storeCopilotFoundrySecret writes to SecretStorage and not workspace settings', async () => {
+  const secretStorage = createSecretStorageStub();
+  const updateSetting = mockSettingsUpdate();
+
+  await storeProviderSecret(secretStorage, 'copilotFoundry.primary', 'super-secret');
+
+  assert.equal(await secretStorage.get('copilotFoundry.primary'), 'super-secret');
+  assert.equal(updateSetting.called, false);
+});
+```
+
+- [ ] **Step 2: Run the test and confirm it fails**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/secretStorage.test.js
+```
+
+Expected:
+
+- FAIL because no SecretStorage command path exists yet
+
+- [ ] **Step 3: Add commands for setting and clearing provider secrets**
+
+In `registerCommands.ts`, add focused commands such as:
+
+```ts
+ralphCodex.setProviderSecret
+ralphCodex.clearProviderSecret
+```
+
+The implementation should:
+
+- prompt for secret key name
+- prompt for secret value securely
+- write to `context.secrets`
+- never persist the secret in workspace settings
+
+Add command contributions in `package.json`.
+
+- [ ] **Step 4: Re-run the secret-storage tests**
+
+Run:
+
+```bash
+npm run compile:tests
+node --require ./test/register-vscode-stub.cjs --test ./out-test/test/secretStorage.test.js
+```
+
+Expected:
+
+- PASS
+
+- [ ] **Step 5: Commit the SecretStorage support**
+
+```bash
+git add src/commands/registerCommands.ts package.json test/secretStorage.test.ts
+git commit -m "feat: add secure provider secret storage commands"
+```
+
+## Task 8: Update docs and secure examples
+
+**Files:**
+- Modify: `README.md`
+- Modify: `docs/workflows.md`
+- Modify: `AGENTS.md` if needed
+
+- [ ] **Step 1: Add a failing docs checklist**
+
+Create a manual checklist in the commit description or local notes and verify these items are currently missing:
+
+```text
+- README mentions copilot-foundry
+- workflows doc explains secure auth sources for both Azure-backed providers
+- no examples show literal API keys in settings
+```
+
+- [ ] **Step 2: Update `README.md`**
+
+Add provider overview language like:
+
+```md
+- `copilot-foundry`: GitHub Copilot CLI configured to use Azure OpenAI BYOK while preserving Copilot's tool and harness behavior
+- `azure-foundry`: RalphDex direct HTTPS Azure provider using secure auth sources only
+```
+
+Include only safe examples:
+
+```json
+{
+  "ralphCodex.cliProvider": "copilot-foundry",
+  "ralphCodex.copilotFoundry": {
+    "auth": {
+      "mode": "env-api-key",
+      "apiKeyEnvVar": "AZURE_OPENAI_API_KEY"
+    },
+    "azure": {
+      "resourceName": "me-me3mef6a-eastus2"
+    },
+    "model": {
+      "deployment": "gpt-5.4"
+    }
+  }
+}
+```
+
+- [ ] **Step 3: Update `docs/workflows.md`**
+
+Replace the old Azure direct-auth section with secure auth guidance:
+
+```md
+Supported auth sources:
+
+1. `az-bearer` — Ralph acquires a bearer token via Azure CLI at runtime
+2. `env-api-key` — Ralph resolves the API key from a named environment variable
+3. `vscode-secret` — Ralph resolves the API key from VS Code SecretStorage
+
+Literal API keys in `settings.json` are not supported.
+```
+
+Document the `copilot-foundry` runtime contract and note that the provider uses Copilot CLI with Azure OpenAI BYOK.
+
+- [ ] **Step 4: Run docs and validation checks relevant to docs**
+
+Run:
+
+```bash
+npm run check:docs
+```
+
+Expected:
+
+- PASS
+
+- [ ] **Step 5: Commit the docs update**
+
+```bash
+git add README.md docs/workflows.md AGENTS.md
+git commit -m "docs: document copilot-foundry and secure Azure auth"
+```
+
+## Task 9: Full verification and final cleanup
+
+**Files:**
+- Modify as needed: any files touched above
+
+- [ ] **Step 1: Run compile**
+
+Run:
+
+```bash
+npm run compile
+```
+
+Expected:
+
+- PASS
+
+- [ ] **Step 2: Run lint/type checks**
+
+Run:
+
+```bash
+npm run lint
+```
+
+Expected:
+
+- PASS
+
+- [ ] **Step 3: Run tests**
+
+Run:
+
+```bash
+npm run test
+```
+
+Expected:
+
+- PASS
+
+- [ ] **Step 4: Run the authoritative validation gate**
+
+Run:
+
+```bash
+npm run validate
+```
+
+Expected:
+
+- PASS
+
+- [ ] **Step 5: Smoke-check `copilot-foundry` readiness manually**
+
+Use a workspace settings fixture or a temporary local settings override with:
+
+```json
+{
+  "ralphCodex.cliProvider": "copilot-foundry",
+  "ralphCodex.copilotFoundry": {
+    "commandPath": "copilot",
+    "approvalMode": "allow-all",
+    "maxAutopilotContinues": 200,
+    "auth": {
+      "mode": "env-api-key",
+      "apiKeyEnvVar": "AZURE_OPENAI_API_KEY"
+    },
+    "azure": {
+      "resourceName": "me-me3mef6a-eastus2",
+      "resourceGroup": "azureai"
+    },
+    "model": {
+      "deployment": "gpt-5.4",
+      "wireApi": "responses"
+    }
+  }
+}
+```
+
+Then run:
+
+```text
+Ralphdex: Show Status
+Ralphdex: Run CLI Iteration
+```
+
+Expected:
+
+- readiness reports `copilot-foundry`
+- auth source resolves without exposing secrets
+- Copilot CLI launch uses Azure OpenAI BYOK env shaping
+
+- [ ] **Step 6: Final commit**
+
+```bash
+git add src package.json README.md docs test
+git commit -m "feat: add copilot-foundry provider and secure Azure auth"
+```

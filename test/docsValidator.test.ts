import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { validateRepositoryDocs } from '../src/validation/docsValidator';

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-docs-validator-'));
}

async function writeFile(rootPath: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = path.join(rootPath, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf8');
}

async function seedValidRepository(rootPath: string): Promise<void> {
  const absolute = (relativePath: string) => path.join(rootPath, relativePath);

  await writeFile(rootPath, 'package.json', JSON.stringify({
    scripts: {
      'publish:dry-run': 'npm run check:runtime && vsce publish --dry-run --no-dependencies'
    },
    contributes: {
      configuration: {
        properties: {
          'ralphCodex.verifierModes': {
            items: {
              enum: ['validationCommand', 'gitDiff', 'taskState']
            }
          },
          'ralphCodex.promptBudgetProfile': {
            default: 'codex'
          },
          'ralphCodex.planningPass': {
            default: {
              enabled: false,
              mode: 'inline'
            }
          },
          'ralphCodex.memoryStrategy': {
            default: 'verbatim'
          },
          'ralphCodex.memoryWindowSize': {
            default: 10
          },
          'ralphCodex.memorySummaryThreshold': {
            default: 20
          },
          'ralphCodex.agentCount': {
            default: 1
          },
          'ralphCodex.pipelineHumanGates': {
            default: false
          }
        }
      }
    }
  }, null, 2));

  await writeFile(rootPath, 'src/ralph/types.ts', [
    "export type RalphVerifierId = 'validationCommand' | 'gitDiff' | 'taskState';",
    "export type RalphStopReason =",
    "  | 'iteration_cap_reached'",
    "  | 'task_marked_complete'",
    "  | 'verification_passed_no_remaining_subtasks'",
    "  | 'repeated_no_progress'",
    "  | 'repeated_identical_failure'",
    "  | 'human_review_needed'",
    "  | 'execution_failed'",
    "  | 'no_actionable_task';"
  ].join('\n'));

  for (const relativePath of [
    'src/commands/registerCommands.ts',
    'src/prompt/promptBuilder.ts',
    'src/ralph/iterationEngine.ts',
    'src/ralph/completionReportParser.ts',
    'src/ralph/taskDecomposition.ts',
    'src/ralph/reconciliation.ts',
    'src/ralph/preflight.ts',
    'src/ralph/taskFile.ts',
    'src/ralph/verifier.ts',
    'src/ralph/loopLogic.ts',
    'src/ralph/integrity.ts',
    'src/ralph/artifactStore.ts',
    'src/codex/claudeCliProvider.ts'
  ]) {
    await writeFile(rootPath, relativePath, '// fixture\n');
  }

  await writeFile(rootPath, 'AGENTS.md', `# AGENTS.md

## Purpose

AGENTS.md is a routing/control document for the repo.

## Working Rules

- Keep AGENTS.md thin and route detailed semantics into focused docs.
- Prefer updating the focused doc that owns a rule instead of restating that rule elsewhere.

## Authoritative Doc Map

- [README.md](${absolute('README.md')}): overview
- [docs/architecture.md](${absolute('docs/architecture.md')}): architecture
- [docs/workflows.md](${absolute('docs/workflows.md')}): workflows
- [docs/testing.md](${absolute('docs/testing.md')}): testing
- [docs/invariants.md](${absolute('docs/invariants.md')}): invariants
- [docs/provenance.md](${absolute('docs/provenance.md')}): provenance
- [docs/verifier.md](${absolute('docs/verifier.md')}): verifier
- [docs/boundaries.md](${absolute('docs/boundaries.md')}): boundaries
- [docs/multi-agent-readiness.md](${absolute('docs/multi-agent-readiness.md')}): multi-agent readiness
- [docs/prompt-calibration.md](${absolute('docs/prompt-calibration.md')}): prompt calibration

## Code Owners For Behavior

- \`src/commands/registerCommands.ts\`: commands
- \`src/prompt/promptBuilder.ts\`: prompts
- \`src/ralph/iterationEngine.ts\`: engine
- \`src/ralph/completionReportParser.ts\`: completion reports
- \`src/ralph/taskDecomposition.ts\`: decomposition
- \`src/ralph/reconciliation.ts\`: reconciliation
- \`src/ralph/preflight.ts\`: preflight
- \`src/ralph/taskFile.ts\`: tasks
- \`src/ralph/verifier.ts\`: verifier
- \`src/ralph/loopLogic.ts\`: loop logic
- \`src/ralph/integrity.ts\`: integrity
- \`src/ralph/artifactStore.ts\`: artifacts
- \`src/codex/claudeCliProvider.ts\`: claude code strategy

## Command And Validation Entry Points

User-facing commands come from \`package.json\` and \`src/commands/registerCommands.ts\`.

Validation entry points:

- \`npm run check:docs\`
- \`npm run validate\`

## Brief Codex Boundaries

- Use documented command handoff and CLI execution only.
`);

  await writeFile(rootPath, 'README.md', `# Ralphdex

## Quick Start

1. Run \`npm run validate\`.

## Document Map

- [AGENTS.md](${absolute('AGENTS.md')}): repo map
- [docs/architecture.md](${absolute('docs/architecture.md')}): architecture
- [docs/workflows.md](${absolute('docs/workflows.md')}): workflows
- [docs/testing.md](${absolute('docs/testing.md')}): testing
- [docs/invariants.md](${absolute('docs/invariants.md')}): invariants
- [docs/provenance.md](${absolute('docs/provenance.md')}): provenance
- [docs/verifier.md](${absolute('docs/verifier.md')}): verifier
- [docs/boundaries.md](${absolute('docs/boundaries.md')}): boundaries
- [docs/multi-agent-readiness.md](${absolute('docs/multi-agent-readiness.md')}): multi-agent readiness
- [docs/prompt-calibration.md](${absolute('docs/prompt-calibration.md')}): prompt calibration
- [docs/release-workflow.md](${absolute('docs/release-workflow.md')}): release workflow
- [docs/failure-recovery.md](${absolute('docs/failure-recovery.md')}): failure recovery
`);

  await writeFile(rootPath, 'docs/release-workflow.md', `# Release Workflow

This document covers the steps to publish a new version to the VS Code Marketplace.

## Steps

### 1. Bump the version

Edit \`package.json\` and increment the version field following semver.

### 2. Update CHANGELOG.md

Add a new section at the top of \`CHANGELOG.md\`.

### 3. Smoke-test the package locally

Run \`npm run package\` to build and inspect the \`.vsix\`.

### 4. Commit and tag

\`\`\`bash
git commit -m "chore(release): bump version to x.y.z"
git tag vx.y.z
git push origin main --tags
\`\`\`

### 5. Publish

\`\`\`bash
npx vsce publish --no-dependencies
\`\`\`

Run \`npm run publish:dry-run\` from the repo root before the real publish step so Marketplace validation exercises the same \`vsce publish\` path without shipping the release.
`);

  await writeFile(rootPath, 'docs/architecture.md', `# Architecture

See [Invariants](${absolute('docs/invariants.md')}), [Provenance](${absolute('docs/provenance.md')}), [Verifier](${absolute('docs/verifier.md')}), and [Boundaries](${absolute('docs/boundaries.md')}).
`);

  await writeFile(rootPath, 'docs/workflows.md', `# Workflows

See [Invariants](${absolute('docs/invariants.md')}), [Provenance](${absolute('docs/provenance.md')}), [Verifier](${absolute('docs/verifier.md')}), and [Boundaries](${absolute('docs/boundaries.md')}).

## Develop The Extension

Run the extension locally.

## Package And Install A .vsix

Use this path to build a distributable \`.vsix\`, then install it through \`Extensions: Install from VSIX...\` or \`code --install-extension\`.

## Prepare A Prompt For IDE Use

Prepare the next prompt.

## Run One CLI Iteration

Run one iteration.

## Run The Ralph Loop

Run the loop.

The autonomyMode setting controls loop defaults, but hard stops still require the operator.

blocked preflight remains a hard stop even in autonomyMode.

## Memory Strategy

Memory strategy controls prior-iteration context.

## Azure AI Foundry Provider

Azure AI Foundry direct-HTTPS provider.

## Inspect State

Inspect persisted state.

## Reset State

Reset generated state.

## Diagnostics

Review runtime diagnostics.
`);

  await writeFile(rootPath, 'docs/testing.md', `# Testing

Run [README.md](${absolute('README.md')}) for the overview and [docs/verifier.md](${absolute('docs/verifier.md')}) for verifier semantics.

## Authoritative Commands

- \`npm run package\`

## What Is Covered

Stable coverage lives here.

## Stub Smoke Vs Real Activation Smoke

Stable activation notes live here.

## What Is Not Covered

manual \`.vsix\` install still needs an operator check.

## Test Runtime Notes

Stable runtime notes live here.

## Packaging Runtime

\`npm run package\` is supported on Node 20+.

check:ledger is the ledger consistency check.
`);

  await writeFile(rootPath, 'docs/invariants.md', `# Invariants

This document owns what must remain true in the Ralph control plane and artifact model.

## Durable Workspace Model

See [Provenance](${absolute('docs/provenance.md')}).

## Task Graph Invariants

Stable task graph rules live here.

## Preflight Invariants

Stable preflight rules live here.

## Iteration Model Invariants

Stable iteration rules live here.

The loop coordinates one selected task and one Codex execution at a time.

## Artifact Model Invariants

Stable artifact rules live here.

## Retention And Cleanup Invariants

Stable cleanup rules live here.
`);

  await writeFile(rootPath, 'docs/provenance.md', `# Provenance

This document owns how Ralph links plans, prompts, invocations, and run bundles into a trusted record.

## Provenance Unit

Stable provenance unit rules live here.

## What Gets Bound Before Execution

Stable binding rules live here.

## CLI Provenance Chain

Stable CLI trust rules live here.

## IDE Handoff Provenance Chain

Stable IDE trust rules live here.

## Integrity Failure Stages

Stable integrity failure rules live here.

## Run Bundle Contract

Stable run bundle rules live here.

## What Operators Can Verify

Stable operator verification rules live here.

## Epistemic Gap

The completion report is a model's self-report. It is labelled as unverified in the run bundle. The epistemicGap object keeps that distinction machine-readable. reconciliationWarnings records divergence cases. Treat verifier-summary.json and related verifier artifacts as the authoritative evidence.
`);

  await writeFile(rootPath, 'docs/verifier.md', `# Verifier

This document owns verifier modes, outcome classifications, and how verification affects loop stopping and review behavior.

## Verifier Modes

Configured through \`ralphCodex.verifierModes\`:

- \`validationCommand\`
- \`gitDiff\`
- \`taskState\`

## Verifier Artifacts

Stable verifier artifact rules live here.

## Outcome Classifications

Stable classifier rules live here.

## No-Progress Detection

Stable no-progress rules live here.

The first narrowed child should reproduce the blocker against the inherited validation command before a later child tries to fix it.

the next narrowed child should implement the smallest bounded fix for that reproduced blocker.

each child should describe one deterministic next step that can be validated with the parent's existing validation command.

## Stop Reasons

- \`iteration_cap_reached\`
- \`task_marked_complete\`
- \`verification_passed_no_remaining_subtasks\`
- \`repeated_no_progress\`
- \`repeated_identical_failure\`
- \`human_review_needed\`
- \`execution_failed\`
- \`no_actionable_task\`

## Precedence Rules

Stable precedence rules live here.

## Feedback Into The Next Prompt

Stable prompt feedback rules live here.
`);

  await writeFile(rootPath, 'docs/boundaries.md', `# Boundaries

This document owns what Ralphdex explicitly does not try to do and where its trust guarantees stop.

## Codex Product Boundary

Stable Codex boundary rules live here.

## Trust Boundary

Stable trust boundary rules live here.

## Control-Plane Boundary

Stable control-plane boundary rules live here.

The shipped control plane is a sequential iteration/loop runner.

The autonomyMode setting does not remove hard stops from the operator-controlled trust model.

## Workspace And Runtime Boundary

Stable workspace rules live here.

## Repository Layout And Workspace State

The rest of the runtime tree is operator-local runtime state and must not be committed.

## Git And Safety Boundary

Stable git boundary rules live here.

## Testing Boundary

Stable testing boundary rules live here.
`);

  await writeFile(rootPath, 'docs/multi-agent-readiness.md', `# Multi-Agent Readiness

This document records the acceptance criterion for lifting Ralph's single-agent execution deferral.

## Task Ownership

Each active task claim is recorded in \`claims.json\` with the owning \`agentId\`.

## Write Serialisation

Concurrent agents must serialize writes through the durable \`claims.json\` ledger before editing files.

## Remediation Isolation

Remediation slices should stay isolated so each \`agentId\` can validate its own bounded change safely.

## Lifting The Deferral

The deferral lifts only after the acceptance criterion is met and \`npm run validate\` passes for the repository.
`);

  await writeFile(rootPath, 'docs/prompt-calibration.md', `# Prompt Calibration

## Calibration Baseline

Stable baseline rules live here.

## Token Target Methodology

The targetTokens value is derived from the context window budget and reasoningEffort setting.

## Recalibration Procedure

Recalibrate when the prompt budget drifts outside the acceptable range. Use medium or high reasoningEffort depending on task complexity.

## Reasoning Effort Overhead

Stable reasoning effort overhead rules live here.
`);

  await writeFile(rootPath, 'docs/release-workflow.md', `# Release Workflow

Steps to publish a new version of the extension to the VS Code Marketplace.

## Steps

1. Bump the version in package.json.
2. Run \`npm run package\`.
3. Run \`npm run publish:dry-run\` so \`vsce publish --dry-run --no-dependencies\` validates the Marketplace publish path without shipping the release.
4. Commit, tag, and run \`npx vsce publish --no-dependencies\`.
`);

  await writeFile(rootPath, 'docs/model-tiering.md', `# Model Tiering

Ralph routes each task to a model tier based on a deterministic complexity score.

## Enabling Model Tiering

Set \`ralphCodex.enableModelTiering\` to true or false.

## Scoring Signals

Signals drive the score.

## Tier Thresholds

Scores map to tiers using two thresholds (the \`ralphCodex.complexityTierThresholds\` within \`ralphCodex.modelTiering\`):

- \`simpleThreshold\` (default 2): tasks below this use the simple model.
- \`complexThreshold\` (default 6): tasks at or above this use the complex model.

## Model And Provider Configuration

Each tier specifies a model and optional provider.

## Expected Cost Savings

Simple tasks land in Haiku; complex tasks escalate to Opus.
`);

  await writeFile(rootPath, 'docs/failure-recovery.md', `# Failure Recovery

This document owns the failure-category taxonomy, recovery playbooks, and cost implications.

## Failure Category Taxonomy

Each failure is classified before a recovery playbook is selected.

## Recovery Playbooks

Each category maps to a recovery action.

## Attempt Limits And Escalation

Recovery state is persisted in recovery-state.json. Attempts are capped by maxRecoveryAttempts.

## Dead-Letter Queue

Tasks that exhaust recovery attempts land in dead-letter.json.

## Observability

Show Status surfaces recovery-state.json and failure-analysis.json fields for the current task.

## Diagnostic Cost

Each LLM diagnostic incurs a token cost recorded in the diagnosticCost field of the provenance bundle.
`);
}

test('validateRepositoryDocs accepts a repo that satisfies the required doc structure', async () => {
  const rootPath = await makeTempRoot();
  await seedValidRepository(rootPath);

  const issues = await validateRepositoryDocs(rootPath);

  assert.deepEqual(issues, []);
});

test('validateRepositoryDocs reports missing required docs and missing headings', async () => {
  const rootPath = await makeTempRoot();
  await seedValidRepository(rootPath);
  await fs.rm(path.join(rootPath, 'docs/provenance.md'));
  await writeFile(rootPath, 'AGENTS.md', '# AGENTS.md\n');

  const issues = await validateRepositoryDocs(rootPath);

  assert.equal(issues.some((issue) => issue.code === 'missing_required_doc' && issue.filePath === 'docs/provenance.md'), true);
  assert.equal(issues.some((issue) => issue.code === 'missing_heading' && issue.filePath === 'AGENTS.md'), true);
});

test('validateRepositoryDocs reports missing AGENTS file references and broken links', async () => {
  const rootPath = await makeTempRoot();
  await seedValidRepository(rootPath);
  await fs.rm(path.join(rootPath, 'src/ralph/verifier.ts'));
  await writeFile(rootPath, 'README.md', `# Ralphdex

## Quick Start

1. Read [Missing Doc](${path.join(rootPath, 'docs', 'missing.md')}).

## Document Map

- [AGENTS.md](${path.join(rootPath, 'AGENTS.md')}): repo map
- [docs/architecture.md](${path.join(rootPath, 'docs/architecture.md')}): architecture
- [docs/workflows.md](${path.join(rootPath, 'docs/workflows.md')}): workflows
- [docs/testing.md](${path.join(rootPath, 'docs/testing.md')}): testing
- [docs/invariants.md](${path.join(rootPath, 'docs/invariants.md')}): invariants
- [docs/provenance.md](${path.join(rootPath, 'docs/provenance.md')}): provenance
- [docs/verifier.md](${path.join(rootPath, 'docs/verifier.md')}): verifier
- [docs/boundaries.md](${path.join(rootPath, 'docs/boundaries.md')}): boundaries
`);

  const issues = await validateRepositoryDocs(rootPath);

  assert.equal(issues.some((issue) => issue.code === 'missing_file_reference' && issue.message.includes('src/ralph/verifier.ts')), true);
  assert.equal(issues.some((issue) => issue.code === 'broken_link' && issue.filePath === 'README.md'), true);
});

test('validateRepositoryDocs reports stale verifier mode or stop-reason lists', async () => {
  const rootPath = await makeTempRoot();
  await seedValidRepository(rootPath);
  await writeFile(rootPath, 'docs/verifier.md', `# Verifier

This document owns verifier modes, outcome classifications, and how verification affects loop stopping and review behavior.

## Verifier Modes

Configured through \`ralphCodex.verifierModes\`:

- \`validationCommand\`
- \`gitDiff\`

## Verifier Artifacts

Stable verifier artifact rules live here.

## Outcome Classifications

Stable classifier rules live here.

## No-Progress Detection

Stable no-progress rules live here.

## Stop Reasons

- \`iteration_cap_reached\`
- \`task_marked_complete\`

## Precedence Rules

Stable precedence rules live here.

## Feedback Into The Next Prompt

Stable prompt feedback rules live here.
`);

  const issues = await validateRepositoryDocs(rootPath);

  assert.equal(issues.some((issue) => issue.code === 'stale_documented_list' && issue.message.includes('Verifier Modes')), true);
  assert.equal(issues.some((issue) => issue.code === 'stale_documented_list' && issue.message.includes('Stop Reasons')), true);
});

test('validateRepositoryDocs reports missing bounded-fix verifier guidance', async () => {
  const rootPath = await makeTempRoot();
  await seedValidRepository(rootPath);
  await writeFile(rootPath, 'docs/verifier.md', `# Verifier

This document owns verifier modes, outcome classifications, and how verification affects loop stopping and review behavior.

## Verifier Modes

Configured through \`ralphCodex.verifierModes\`:

- \`validationCommand\`
- \`gitDiff\`
- \`taskState\`

## Verifier Artifacts

Stable verifier artifact rules live here.

## Outcome Classifications

Stable classifier rules live here.

## No-Progress Detection

Stable no-progress rules live here.

The first narrowed child should reproduce the blocker against the inherited validation command before a later child tries to fix it.

## Stop Reasons

- \`iteration_cap_reached\`
- \`task_marked_complete\`
- \`verification_passed_no_remaining_subtasks\`
- \`repeated_no_progress\`
- \`repeated_identical_failure\`
- \`human_review_needed\`
- \`execution_failed\`
- \`no_actionable_task\`

## Precedence Rules

Stable precedence rules live here.

## Feedback Into The Next Prompt

Stable prompt feedback rules live here.
`);

  const issues = await validateRepositoryDocs(rootPath);

  assert.equal(
    issues.some(
      (issue) =>
        issue.code === 'missing_fragment'
        && issue.filePath === 'docs/verifier.md'
        && issue.message.includes('the next narrowed child should implement the smallest bounded fix')
    ),
    true
  );
});

test('validateRepositoryDocs reports missing Marketplace dry-run release validation guidance', async () => {
  const rootPath = await makeTempRoot();
  await seedValidRepository(rootPath);
  await writeFile(rootPath, 'package.json', JSON.stringify({
    contributes: {
      configuration: {
        properties: {
          'ralphCodex.verifierModes': {
            items: {
              enum: ['validationCommand', 'gitDiff', 'taskState']
            }
          },
          'ralphCodex.promptBudgetProfile': {
            default: 'codex'
          },
          'ralphCodex.planningPass': {
            default: {
              enabled: false,
              mode: 'inline'
            }
          },
          'ralphCodex.memoryStrategy': {
            default: 'verbatim'
          },
          'ralphCodex.memoryWindowSize': {
            default: 10
          },
          'ralphCodex.memorySummaryThreshold': {
            default: 20
          },
          'ralphCodex.agentCount': {
            default: 1
          },
          'ralphCodex.pipelineHumanGates': {
            default: false
          }
        }
      }
    }
  }, null, 2));
  await writeFile(rootPath, 'docs/release-workflow.md', `# Release Workflow

This document covers the steps to publish a new version to the VS Code Marketplace.

## Steps

### 1. Bump the version

Edit \`package.json\` and increment the version field following semver.

### 2. Update CHANGELOG.md

Add a new section at the top of \`CHANGELOG.md\`.

### 3. Smoke-test the package locally

Run \`npm run package\` to build and inspect the \`.vsix\`.

### 4. Publish

\`\`\`bash
npx vsce publish --no-dependencies
\`\`\`
`);

  const issues = await validateRepositoryDocs(rootPath);

  assert.equal(
    issues.some(
      (issue) =>
        issue.code === 'missing_release_validation_path'
        && issue.filePath === 'docs/release-workflow.md'
    ),
    true
  );
  assert.equal(
    issues.some(
      (issue) =>
        issue.code === 'missing_package_script'
        && issue.filePath === 'package.json'
        && issue.message.includes('publish:dry-run')
    ),
    true
  );
});

test('validateRepositoryDocs keeps AGENTS.md on a small line budget', async () => {
  const rootPath = await makeTempRoot();
  await seedValidRepository(rootPath);
  const extraLines = Array.from({ length: 100 }, (_, index) => `Extra rule ${index + 1}`).join('\n\n');
  await fs.appendFile(path.join(rootPath, 'AGENTS.md'), `\n${extraLines}\n`, 'utf8');

  const issues = await validateRepositoryDocs(rootPath);

  assert.equal(issues.some((issue) => issue.code === 'line_budget_exceeded' && issue.filePath === 'AGENTS.md'), true);
});

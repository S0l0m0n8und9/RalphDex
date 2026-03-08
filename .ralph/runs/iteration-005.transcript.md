# Codex Exec Transcript

- Command: codex exec --model gpt-5.4 --sandbox workspace-write --config approval_policy="never" --cd /home/admin/Documents/repos/Ralph --output-last-message /home/admin/Documents/repos/Ralph/.ralph/runs/iteration-005.last-message.md -
- Prompt path: /home/admin/Documents/repos/Ralph/.ralph/artifacts/iteration-005/prompt.md
- Prompt hash: sha256:1119dfee900dff65b9a2e8ccc7b262e27c72afeceeab55f56980212fd4b90537
- Prompt bytes: 5943
- Stdin hash: sha256:1119dfee900dff65b9a2e8ccc7b262e27c72afeceeab55f56980212fd4b90537
- Payload matched prompt artifact: yes
- Last message path: /home/admin/Documents/repos/Ralph/.ralph/runs/iteration-005.last-message.md
- Exit code: 0

## Stdout

**Changed**
Added deterministic handoff coverage in the stub smoke suite so clipboard and IDE-command flows are now exercised end to end in tests: [commandShell.smoke.test.ts](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts#L64), [register-vscode-stub.cjs](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/register-vscode-stub.cjs#L4), [vscodeTestHarness.ts](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts#L6). The new cases cover prompt clipboard auto-copy, `Open Codex IDE` in `clipboard` mode, `ideCommand` mode with successful command execution, missing-command fallback warnings, and the `cliExec` warning-only fallback.

Documented the operator-facing handoff rules and remaining live-host limits in [workflows.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/workflows.md#L21), [testing.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/testing.md#L20), and [boundaries.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md#L70). Updated durable Ralph state to mark T5 complete in [tasks.json](/home/admin/Documents/repos/Ralph/.ralph/tasks.json#L33) and [progress.md](/home/admin/Documents/repos/Ralph/.ralph/progress.md#L3).

**Validation**
Ran `cd ralph-codex-vscode-starter && npm test` and it passed: 15 tests, 0 failures.

**Assumptions / Limitations**
No blockers. I left the pre-existing unrelated dirty worktree state intact. Remaining gap is still real host verification for clipboard and VS Code command handoff; the new coverage is deterministic stub smoke, not live Extension Development Host UI automation.


## Stderr

OpenAI Codex v0.111.0 (research preview)
--------
workdir: /home/admin/Documents/repos/Ralph
model: gpt-5.4
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR, /home/admin/.codex/memories]
reasoning effort: high
reasoning summaries: none
session id: 019cca49-f845-7351-9bb7-091a0a79f9ab
--------
user
# Ralph Prompt: iteration (cliExec)

You are continuing Ralph work from durable repository state, not from chat memory. Re-inspect the repo and selected task before editing.

## Template Selection
A prior Ralph prompt exists and there is no stronger prior-iteration signal that requires a specialized follow-up prompt.

## Prompt Strategy
- Target: Codex CLI execution via `codex exec`.
- Operate autonomously inside the repository. Do not rely on interactive clarification to make forward progress.
- Keep command usage deterministic and concise because Ralph will persist transcripts, verifier output, and stop signals.
- End with a compact change summary Ralph can pair with verifier evidence.

## Preflight Snapshot
- Ready: yes
- Summary: Preflight ready: Selected task T5. Validation cd ralph-codex-vscode-starter && npm test. Executable confirmed. Task graph: ok | Workspace/runtime: ok | Codex adapter: 1 warning, 1 info | Validation/verifier: 1 info
- codexAdapter warning: Codex CLI will be resolved from PATH at runtime: codex. Availability is assumed until execution starts.

## Objective Snapshot
# Product / project brief

## Objective

Build Ralph into a durable, file-backed multi-agent delivery framework that can move a repository from requirements analysis through implementation, testing, and orchestration without depending on chat memory.

## Product direction

Ralph should let an operator define the work once in `.ralph/`, then execute repeatable Codex-driven iterations that stay inspectable across fresh sessions. The framework needs to strengthen both the quality of agent work and the control plane around it, so each step is deterministic, resumable, and supported by durable evidence.

## Core outcomes

- Turn requirements, progress, and task state into the shared source of truth for all agent activity.
- Support end-to-end delivery flow across requirements analysis, implementation, validation, and orchestration.
[trimmed for size]

## Repo Context
- Workspace: Ralph
- Root path: /home/admin/Documents/repos/Ralph
- Manifests: none
- Source roots: none
- Package managers: none
- Validation commands: none
- Lifecycle commands: none
- CI files: none
- Docs: none
- Test signals: none

## Ralph Runtime Context
- Prompt target: cliExec
- Current iteration number: 5
- Next iteration recorded in state: 5
- Last prompt kind: iteration
- Last prompt path: .ralph/prompts/iteration-004.prompt.md
- Last run: succeeded at iteration 4
- Last iteration outcome: complete at iteration 4
- PRD path: .ralph/prd.md
- Progress path: .ralph/progress.md
- Task file path: .ralph/tasks.json
- Runtime state path: .ralph/state.json
- Artifact root: .ralph/artifacts
- Last iteration summary: Selected T4: Add regression coverage for nested workspace scanning and prompt repo-context rendering | Execution: succeeded | Verification: passed | Outcome: complete | Backlog remaining: 3

## Task Focus
- Backlog counts: todo 3, in_progress 0, blocked 0, done 4
- Next actionable task: T5 (todo)
- Selected task id: T5
- Title: Cover clipboard and IDE handoff strategies with automated tests and explicit docs
- Status: todo
- Parent task: none
- Dependencies: none
- Direct children: none
- Remaining descendants: none
- Task validation hint: cd ralph-codex-vscode-starter && npm test
- Selected validation command: cd ralph-codex-vscode-starter && npm test
- Notes: The current test plan explicitly leaves clipboard and VS Code command handoff behavior uncovered.
- Blocker: none

## Recent Progress
# Progress
- Ralph workspace initialized.
- Refined `.ralph/prd.md` into a concrete objective for a durable, file-backed multi-agent delivery framework spanning requirements, implementation, testing, and orchestration.
- Replaced the seed backlog in `.ralph/tasks.json` with repo-specific work derived from the actual `ralph-codex-vscode-starter` extension surface and current coverage gaps.
- Completed T3 by validating nested project-root selection for `ralph-codex-vscode-starter`, adding scanner/status regressions, and rebuilding the extension runtime artifacts.
- Completed T4 by adding regression coverage for nested workspace root-selection candidates and prompt repo-context rendering so nested child repos remain visible in generated prompts.
- Use this file for durable progress notes between fresh Codex runs.

## Prior Iteration Evidence
- Prior iteration: 4
- Prior outcome classification: complete
- Prior execution / verification: succeeded / passed
- Prior follow-up action: continue_next_task
- Prior summary: Selected T4: Add regression coverage for nested workspace scanning and prompt repo-context rendering | Execution: succeeded | Verification: passed | Outcome: complete | Backlog remaining: 3
- Prior stop reason: none
- Prior validation failure signature: none
- Additional prior-context signals omitted: 6.

## Operating Rules
- Read AGENTS.md plus the durable Ralph files before making non-trivial changes.
- Do not invent unsupported Codex IDE APIs or hidden handoff channels.
- Keep architecture thin, deterministic, and file-backed.
- Make the smallest coherent change that materially advances the selected Ralph task.
- Prefer the repository’s real validation commands when they exist.
- Update durable Ralph progress/tasks when the task state materially changes.

## Execution Contract
1. Inspect the workspace facts and selected Ralph task before editing.
2. Execute only the selected task, or explain deterministically why no safe task is available.
3. Implement the smallest coherent improvement that advances the task.
4. Update durable Ralph files when task state or progress changes.
5. Run the selected validation command when available and report the concrete result.
6. End with a compact result Ralph can pair with verifier and artifact evidence.

## Final Response Contract
- Changed files.
- Validation results.
- Assumptions or blockers.
- Known limitations or follow-up work.

mcp: codex_apps starting
mcp: codex_apps ready
mcp startup: ready: codex_apps
codex
Re-inspecting the repository and the selected T5 task before making changes. I’m checking the durable Ralph state, the extension code path for clipboard/IDE handoff, and the current tests so I can make the smallest coherent change and validate it with the repo’s test command.
exec
/bin/bash -lc "sed -n '1,220p' .ralph/progress.md" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,220p' .ralph/tasks.json" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc 'git status --short' in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc 'rg -n "clipboard|VS Code|vscode|handoff|codex exec|clip" -S ralph-codex-vscode-starter' in /home/admin/Documents/repos/Ralph succeeded in 51ms:
{
  "version": 2,
  "tasks": [
    {
      "id": "T1",
      "title": "Write or refine the project objective in the PRD file",
      "status": "done",
      "notes": "The prompt generator reads the PRD file directly."
    },
    {
      "id": "T2",
      "title": "Replace this seed task list with repo-specific work",
      "status": "done",
      "notes": "Keep statuses current so fresh Codex runs can resume deterministically."
    },
    {
      "id": "T3",
      "title": "Detect nested project roots so Ralph can inspect the starter extension from the repo root",
      "status": "done",
      "notes": "Workspace scanning now selects the nested `ralph-codex-vscode-starter` project root when the repo root has no shallow markers, and the runtime build was refreshed so the extension uses the updated scan path.",
 succeeded in 51ms:
# Progress

- Ralph workspace initialized.
- Refined `.ralph/prd.md` into a concrete objective for a durable, file-backed multi-agent delivery framework spanning requirements, implementation, testing, and orchestration.
- Replaced the seed backlog in `.ralph/tasks.json` with repo-specific work derived from the actual `ralph-codex-vscode-starter` extension surface and current coverage gaps.
- Completed T3 by validating nested project-root selection for `ralph-codex-vscode-starter`, adding scanner/status regressions, and rebuilding the extension runtime artifacts.
- Completed T4 by adding regression coverage for nested workspace root-selection candidates and prompt repo-context rendering so nested child repos remain visible in generated prompts.
- Use this file for durable progress notes between fresh Codex runs.
 succeeded in 51ms:
 M .ralph/artifacts/latest-cli-invocation.json
 M .ralph/artifacts/latest-execution-plan.json
 M .ralph/artifacts/latest-preflight-report.json
 M .ralph/artifacts/latest-preflight-summary.md
 M .ralph/artifacts/latest-prompt-evidence.json
 M .ralph/artifacts/latest-prompt.md
 M .ralph/artifacts/latest-provenance-bundle.json
 M .ralph/artifacts/latest-provenance-summary.md
 M .ralph/artifacts/latest-result.json
 M .ralph/artifacts/latest-summary.md
 M .ralph/artifacts/runs/run-i002-cli-20260307T212740Z/provenance-bundle.json
 M .ralph/artifacts/runs/run-i002-cli-20260307T212740Z/summary.md
 M .ralph/logs/extension.log
 M .ralph/progress.md
 M .ralph/state.json
 M .ralph/tasks.json
 M ralph-codex-vscode-starter/README.md
 M ralph-codex-vscode-starter/docs/architecture.md
 M ralph-codex-vscode-starter/docs/provenance.md
 M ralph-codex-vscode-starter/out/commands/registerCommands.js
 succeeded in 51ms:
Total output lines: 453

ralph-codex-vscode-starter/AGENTS.md:5:Ralph Codex Workbench is a VS Code extension that:
ralph-codex-vscode-starter/AGENTS.md:8:- hands prepared prompts to Codex through clipboard plus configurable VS Code command IDs
ralph-codex-vscode-starter/AGENTS.md:9:- runs controlled `codex exec` iterations with deterministic verification, provenance, and stop behavior
ralph-codex-vscode-starter/AGENTS.md:21:- [README.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/README.md): product overview, quick start, and doc index
ralph-codex-vscode-starter/AGENTS.md:22:- [docs/architecture.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/architecture.md): module boundaries and end-to-end flow
ralph-codex-vscode-starter/AGENTS.md:23:- [docs/workflows.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/workflows.md): command-driven operator workflows
ralph-codex-vscode-starter/AGENTS.md:24:- [docs/testing.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/testing.md): validation gate and test coverage
ralph-codex-vscode-starter/AGENTS.md:25:- [docs/invariants.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md): control-plane, task-schema, and artifact-model invariants
ralph-codex-vscode-starter/AGENTS.md:26:- [docs/provenance.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md): prompt/plan/invocation/run trust chain
ralph-codex-vscode-starter/AGENTS.md:27:- [docs/verifier.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md): verifier modes, outcome classes, and stop implications
ralph-codex-vscode-starter/AGENTS.md:28:- [docs/boundaries.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md): explicit non-goals, trust limits, and Codex boundaries
ralph-codex-vscode-starter/AGENTS.md:64:- IDE handoff is clipboard plus `vscode.commands.executeCommand(...)`.
ralph-codex-vscode-starter/AGENTS.md:65:- Scripted automation is `codex exec`.
ralph-codex-vscode-starter/AGENTS.md:68:- CLI runs can prove prepared-and-executed prompt integrity; IDE handoff only proves the prepared prompt bundle.
ralph-codex-vscode-starter/package.json:4:  "description": "VS Code extension for file-backed Ralph prompts, Codex IDE handoff, and codex exec loops.",
ralph-codex-vscode-starter/package.json:9:    "vscode": "^1.95.0",
ralph-codex-vscode-starter/package.json:19:      "description": "Ralph Codex Workbench supports status inspection in untrusted workspaces. Prompt generation, runtime state reset, IDE handoff, and Codex CLI execution require workspace trust.",
ralph-codex-vscode-starter/package.json:38:        "ralphCodex.clipboardAutoCopy",
codex
The worktree is already dirty in both Ralph state files and the starter extension, so I’m treating existing edits as user state and only touching the files needed for T5. Next I’m reading the extension’s handoff implementation, current test gaps, and the operator docs that mention clipboard and IDE command behavior.
exec
/bin/bash -lc "sed -n '1,220p' ralph-codex-vscode-starter/AGENTS.md" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,260p' ralph-codex-vscode-starter/src/commands/registerCommands.ts" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '260,520p' ralph-codex-vscode-starter/src/commands/registerCommands.ts" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,260p' ralph-codex-vscode-starter/test/registerCommands.test.ts" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,260p' ralph-codex-vscode-starter/docs/testing.md" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,260p' ralph-codex-vscode-starter/docs/workflows.md" in /home/admin/Documents/repos/Ralph succeeded in 50ms:
# AGENTS.md

## Purpose

Ralph Codex Workbench is a VS Code extension that:

- builds Ralph prompts from durable workspace files
- hands prepared prompts to Codex through clipboard plus configurable VS Code command IDs
- runs controlled `codex exec` iterations with deterministic verification, provenance, and stop behavior

## Working Rules

- Edit `src/` and `test/`. Treat `out/`, `out-test/`, and packaged `.vsix` files as generated artifacts.
- Keep `AGENTS.md` thin: AGENTS.md is a routing/control document, not the place for detailed durable rules.
- `package.json` is authoritative for commands, settings, activation events, scripts, and runtime expectations.
- Keep docs aligned with code in the same change.
- Prefer updating the focused doc that owns a rule instead of restating that rule elsewhere.

## Authoritative Doc Map

 succeeded in 51ms:
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { RalphIterationEngine } from '../ralph/iterationEngine';
import { buildPreflightReport } from '../ralph/preflight';
import { buildStatusReport, resolveLatestStatusArtifacts, RalphStatusSnapshot } from '../ralph/statusReport';
import { RalphStateManager } from '../ralph/stateManager';
import { selectNextTask } from '../ralph/taskFile';
import { RalphCliInvocation, RalphExecutionPlan, RalphProvenanceBundle } from '../ralph/types';
import { captureGitStatus, chooseValidationCommand, inspectValidationCommandReadiness } from '../ralph/verifier';
import { inspectCodexCliSupport, inspectIdeCommandSupport } from '../services/codexCliSupport';
import { Logger } from '../services/logger';
import { scanWorkspace } from '../services/workspaceScanner';
import { requireTrustedWorkspace } from './workspaceSupport';

interface RegisteredCommandSpec {
  commandId: string;
  label: string;
 succeeded in 51ms:
    await openTextFile(latestArtifacts.latestPreflightSummaryPath);
    return true;
  }

  const reason = inspection.state.lastIteration
    ? 'The latest Ralph summary artifact is missing from the artifact directory.'
    : 'No Ralph summary exists yet because no CLI iteration has completed and no preflight has been persisted.';
  void vscode.window.showInformationMessage(
    `${reason} Run Ralph Codex: Run CLI Iteration or Ralph Codex: Run CLI Loop, then try again.`
  );
  return false;
}

async function openLatestProvenanceBundle(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<boolean> {
  const config = readConfig(workspaceFolder);
  const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
 exited 2 in 51ms:
sed: can't read ralph-codex-vscode-starter/test/registerCommands.test.ts: No such file or directory
 succeeded in 50ms:
# Testing

Related docs:

- [README.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/README.md)
- [docs/architecture.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/architecture.md)
- [docs/workflows.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/workflows.md)
- [docs/verifier.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md)

## Authoritative Commands

- `npm run compile`: build the extension from `src/` to `out/`.
- `npm run lint`: type-check `src/` and `test/` without emitting files.
- `npm run check:docs`: run deterministic documentation structure, link, ownership, and lightweight code-doc alignment checks.
- `npm test`: run `npm run compile:tests` and then execute the Node test suite from `out-test/test/`.
- `npm run test:activation`: launch a real Extension Development Host smoke test through `@vscode/test-electron`.
- `npm run validate`: run `compile`, `check:docs`, `lint`, and `test`.
- `npm run package`: verify the Node runtime and then build a `.vsix` package with `vsce`.

## What Is Covered
 succeeded in 50ms:
# Workflows

This document owns operator-facing command flows. Semantic rules for invariants, provenance, verifier behavior, and boundaries live in the focused docs linked below.

Related docs:

- [Invariants](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md)
- [Provenance](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md)
- [Verifier](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md)
- [Boundaries](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md)

## Develop The Extension

1. Run `npm install`.
2. Run `npm run compile`.
3. Start the Extension Development Host with `F5`.
4. Re-run `npm run compile` after TypeScript changes, or use `npm run watch`.

Use [docs/testing.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/testing.md) for the validation gate and test coverage.

codex
I found the current docs explicitly calling clipboard/IDE handoff uncovered, and the command tests live under the smoke harness rather than a dedicated `registerCommands` file. I’m narrowing to the actual handoff strategy implementation and the existing command-shell tests so I can add deterministic coverage instead of broad UI simulation.
exec
/bin/bash -lc "sed -n '1,240p' ralph-codex-vscode-starter/src/codex/providerFactory.ts" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc 'rg -n "handoffPrompt|getPromptHandoffStrategy|clipboardAutoCopy|preferredHandoffMode|openCodexAndCopyPrompt|commandShell" -S ralph-codex-vscode-starter/src ralph-codex-vscode-starter/test' in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,280p' ralph-codex-vscode-starter/test/commandShell.smoke.test.ts" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,260p' ralph-codex-vscode-starter/test/register-vscode-stub.cjs" in /home/admin/Documents/repos/Ralph succeeded in 51ms:
import { CodexHandoffMode } from '../config/types';
import { Logger } from '../services/logger';
import { ClipboardCodexStrategy } from './clipboardStrategy';
import { CliExecCodexStrategy } from './cliExecStrategy';
import { IdeCommandCodexStrategy } from './ideCommandStrategy';
import { CodexStrategy, CodexStrategyId } from './types';

export class CodexStrategyRegistry {
  private readonly clipboardStrategy = new ClipboardCodexStrategy();
  private readonly ideStrategy = new IdeCommandCodexStrategy();
  private readonly cliExecStrategy: CliExecCodexStrategy;

  public constructor(logger: Logger) {
    this.cliExecStrategy = new CliExecCodexStrategy(logger);
  }

  public getById(id: CodexStrategyId): CodexStrategy {
    switch (id) {
      case 'clipboard':
        return this.clipboardStrategy;
 succeeded in 51ms:
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { activate } from '../src/extension';
import { vscodeTestHarness } from './support/vscodeTestHarness';

class MemoryMemento implements vscode.Memento {
  private readonly values = new Map<string, unknown>();

  public keys(): readonly string[] {
    return Array.from(this.values.keys());
  }

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    return this.values.has(key) ? this.values.get(key) as T : defaultValue;
 succeeded in 51ms:
ralph-codex-vscode-starter/test/workspaceSupport.test.ts:53:    preferredHandoffMode: 'ideCommand',
ralph-codex-vscode-starter/test/workspaceSupport.test.ts:65:    preferredHandoffMode: 'ideCommand',
ralph-codex-vscode-starter/src/commands/registerCommands.ts:177:    preferredHandoffMode: config.preferredHandoffMode,
ralph-codex-vscode-starter/src/commands/registerCommands.ts:389:      if (prepared.config.clipboardAutoCopy) {
ralph-codex-vscode-starter/src/commands/registerCommands.ts:391:        const result = await clipboardStrategy.handoffPrompt?.({
ralph-codex-vscode-starter/src/commands/registerCommands.ts:428:    commandId: 'ralphCodex.openCodexAndCopyPrompt',
ralph-codex-vscode-starter/src/commands/registerCommands.ts:433:      const strategy = strategies.getPromptHandoffStrategy(prepared.config.preferredHandoffMode);
ralph-codex-vscode-starter/src/commands/registerCommands.ts:434:      const result = await strategy.handoffPrompt?.({
ralph-codex-vscode-starter/src/commands/registerCommands.ts:453:      if (prepared.config.preferredHandoffMode === 'cliExec') {
ralph-codex-vscode-starter/src/commands/registerCommands.ts:455:          'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
ralph-codex-vscode-starter/src/services/codexCliSupport.ts:13:  preferredHandoffMode: CodexHandoffMode;
ralph-codex-vscode-starter/src/services/codexCliSupport.ts:75:  preferredHandoffMode: CodexHandoffMode;
ralph-codex-vscode-starter/src/services/codexCliSupport.ts:80:  if (input.preferredHandoffMode !== 'ideCommand') {
ralph-codex-vscode-starter/src/services/codexCliSupport.ts:82:      preferredHandoffMode: input.preferredHandoffMode,
ralph-codex-vscode-starter/src/services/codexCliSupport.ts:97:    preferredHandoffMode: input.preferredHandoffMode,
ralph-codex-vscode-starter/src/codex/types.ts:52:  handoffPrompt?(request: PromptHandoffRequest): Promise<CodexActionResult>;
ralph-codex-vscode-starter/src/codex/clipboardStrategy.ts:8:  public async handoffPrompt(request: PromptHandoffRequest): Promise<CodexActionResult> {
ralph-codex-vscode-starter/src/codex/ideCommandStrategy.ts:30:  public async handoffPrompt(request: PromptHandoffRequest): Promise<CodexActionResult> {
ralph-codex-vscode-starter/src/codex/providerFactory.ts:28:  public getPromptHandoffStrategy(mode: CodexHandoffMode): CodexStrategy {
ralph-codex-vscode-starter/src/config/defaults.ts:5:  preferredHandoffMode: 'ideCommand',
 succeeded in 50ms:
const fs = require('node:fs');
const Module = require('node:module');

const state = {
  configuration: {},
  workspaceFolders: [],
  isTrusted: true,
  availableCommands: [],
  infoMessages: [],
  warningMessages: [],
  errorMessages: [],
  shownDocuments: [],
  executedCommands: [],
  inputBoxValue: undefined,
  messageChoice: undefined
};

function reset() {
  state.configuration = {};
  state.workspaceFolders = [];
codex
I have the shape now: the stub harness already records clipboard, command execution, warnings, and info messages, so T5 can be closed with focused smoke tests plus doc updates. I’m checking the strategy classes and config surface next to cover the exact behaviors the operator relies on.
exec
/bin/bash -lc "sed -n '1,220p' ralph-codex-vscode-starter/src/codex/clipboardStrategy.ts" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,260p' ralph-codex-vscode-starter/src/codex/ideCommandStrategy.ts" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,220p' ralph-codex-vscode-starter/src/codex/types.ts" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,280p' ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '180,270p' ralph-codex-vscode-starter/package.json" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc 'rg -n "clipboardAutoCopy|preferredHandoffMode|openSidebarCommandId|newChatCommandId" -S ralph-codex-vscode-starter/README.md ralph-codex-vscode-starter/docs' in /home/admin/Documents/repos/Ralph succeeded in 51ms:
import * as path from 'path';
import * as vscode from 'vscode';
import { CodexActionResult, CodexStrategy, PromptHandoffRequest } from './types';

export class ClipboardCodexStrategy implements CodexStrategy {
  public readonly id = 'clipboard' as const;

  public async handoffPrompt(request: PromptHandoffRequest): Promise<CodexActionResult> {
    const warnings: string[] = [];

    if (request.copyToClipboard) {
      await vscode.env.clipboard.writeText(request.prompt);
    } else {
      warnings.push('Clipboard auto-copy is disabled, so the prompt was only written to disk.');
    }

    return {
      strategy: this.id,
      success: true,
      message: `Prompt ready at ${path.basename(request.promptPath)}.`,
 succeeded in 50ms:
import * as path from 'path';
import * as vscode from 'vscode';
import { CodexActionResult, CodexStrategy, PromptHandoffRequest } from './types';

async function runVsCodeCommand(
  commandId: string,
  availableCommands: Set<string>,
  warnings: string[],
  warningText: string
): Promise<void> {
  if (!commandId || commandId === 'none') {
    return;
  }

  if (!availableCommands.has(commandId)) {
    warnings.push(warningText);
    return;
  }

  try {
 succeeded in 51ms:
import { CodexApprovalMode, CodexSandboxMode } from '../config/types';
import { RalphPromptKind } from '../ralph/types';

export type CodexStrategyId = 'ideCommand' | 'clipboard' | 'cliExec';

export interface CodexActionResult {
  strategy: CodexStrategyId;
  success: boolean;
  message: string;
  warnings: string[];
}

export interface PromptHandoffRequest {
  prompt: string;
  promptPath: string;
  promptKind: RalphPromptKind;
  iteration: number;
  copyToClipboard: boolean;
  openSidebarCommandId: string;
  newChatCommandId: string;
 succeeded in 51ms:
export interface VscodeMessageCall {
  message: string;
  items: string[];
}

export interface VscodeStubState {
  configuration: Record<string, unknown>;
  workspaceFolders: unknown[];
  isTrusted: boolean;
  availableCommands: string[];
  infoMessages: VscodeMessageCall[];
  warningMessages: VscodeMessageCall[];
  errorMessages: VscodeMessageCall[];
  shownDocuments: Array<string | null>;
  executedCommands: Array<{ command: string; args: unknown[] }>;
  inputBoxValue?: string;
  messageChoice?: string;
}

export interface VscodeTestHarness {
 succeeded in 51ms:
          "type": "string",
          "default": ".ralph/prd.md",
          "description": "Workspace-relative path to the durable Ralph PRD or objective file."
        },
        "ralphCodex.progressPath": {
          "type": "string",
          "default": ".ralph/progress.md",
          "description": "Workspace-relative path to the durable Ralph progress log."
        },
        "ralphCodex.promptTemplateDirectory": {
          "type": "string",
          "default": "",
          "description": "Optional workspace-relative or absolute directory containing Ralph prompt templates. Leave empty to use the bundled templates."
        },
        "ralphCodex.promptIncludeVerifierFeedback": {
          "type": "boolean",
          "default": true,
          "description": "Include compact prior iteration and verifier feedback when shaping the next prompt."
        },
        "ralphCodex.promptPriorContextBudget": {
 succeeded in 50ms:
ralph-codex-vscode-starter/docs/boundaries.md:22:- treating `preferredHandoffMode = cliExec` as if `Open Codex IDE` should run the CLI
🌐 Searching the web...
🌐 Searched the web
codex
The strategy code is straightforward and exposes the exact edge cases T5 calls out: clipboard copy disabled, missing VS Code command IDs, and the `cliExec` fallback warning. The remaining gap is mostly tests and operator docs, and I also need to extend the stub harness so those tests can assert clipboard behavior cleanly.
exec
/bin/bash -lc "rg -n \"env\\.clipboard|showWarningMessage\\(|showInformationMessage\\(|openCodexAndCopyPrompt|generatePrompt\" -S ralph-codex-vscode-starter/test ralph-codex-vscode-starter/src" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,220p' ralph-codex-vscode-starter/src/extension.ts" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,220p' ralph-codex-vscode-starter/README.md" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,200p' ralph-codex-vscode-starter/docs/boundaries.md" in /home/admin/Documents/repos/Ralph succeeded in 50ms:
ralph-codex-vscode-starter/src/commands/registerCommands.ts:55:  await vscode.window.showWarningMessage(warnings.join(' '));
ralph-codex-vscode-starter/src/commands/registerCommands.ts:267:  void vscode.window.showInformationMessage(
ralph-codex-vscode-starter/src/commands/registerCommands.ts:293:  void vscode.window.showInformationMessage(
ralph-codex-vscode-starter/src/commands/registerCommands.ts:311:    void vscode.window.showInformationMessage(
ralph-codex-vscode-starter/src/commands/registerCommands.ts:318:  const choice = await vscode.window.showInformationMessage(
ralph-codex-vscode-starter/src/commands/registerCommands.ts:375:    commandId: 'ralphCodex.generatePrompt',
ralph-codex-vscode-starter/src/commands/registerCommands.ts:419:      void vscode.window.showInformationMessage(
ralph-codex-vscode-starter/src/commands/registerCommands.ts:428:    commandId: 'ralphCodex.openCodexAndCopyPrompt',
ralph-codex-vscode-starter/src/commands/registerCommands.ts:454:        await vscode.window.showWarningMessage(
ralph-codex-vscode-starter/src/commands/registerCommands.ts:462:          void vscode.window.showInformationMessage(result.message);
ralph-codex-vscode-starter/src/commands/registerCommands.ts:464:          void vscode.window.showWarningMessage(result.message);
ralph-codex-vscode-starter/src/commands/registerCommands.ts:488:      void vscode.window.showInformationMessage(note ? `${baseMessage} ${note}` : baseMessage);
ralph-codex-vscode-starter/src/commands/registerCommands.ts:523:          void vscode.window.showInformationMessage(
ralph-codex-vscode-starter/src/commands/registerCommands.ts:530:      void vscode.window.showInformationMessage(
ralph-codex-vscode-starter/src/commands/registerCommands.ts:560:      const choice = await vscode.window.showInformationMessage(
ralph-codex-vscode-starter/src/commands/registerCommands.ts:614:      const confirmed = await vscode.window.showWarningMessage(
ralph-codex-vscode-starter/src/commands/registerCommands.ts:632:      void vscode.window.showInformationMessage('Ralph runtime state reset. Durable PRD, progress, and task files were preserved.');
ralph-codex-vscode-starter/test/commandShell.smoke.test.ts:79:  assert.ok(commands.includes('ralphCodex.generatePrompt'));
ralph-codex-vscode-starter/src/codex/clipboardStrategy.ts:12:      await vscode.env.clipboard.writeText(request.prompt);
ralph-codex-vscode-starter/src/codex/ideCommandStrategy.ts:35:      await vscode.env.clipboard.writeText(request.prompt);
 succeeded in 51ms:
import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { Logger } from './services/logger';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger(vscode.window.createOutputChannel('Ralph Codex'));
  context.subscriptions.push(logger);
  registerCommands(context, logger);
  logger.info('Activated Ralph Codex Workbench extension.', {
    workspaceTrusted: vscode.workspace.isTrusted,
    activationMode: vscode.workspace.isTrusted ? 'full' : 'limited'
  });
}

export function deactivate(): void {
  // no-op
}
 succeeded in 51ms:
# Ralph Codex Workbench

Ralph Codex Workbench is a VS Code extension for durable, repo-backed Codex loops. It keeps the Ralph objective, progress log, task graph, prompts, run artifacts, verifier output, and provenance evidence on disk under `.ralph/` so a new Codex session can resume from inspectable state instead of chat history.

The extension has two execution paths:

- prepare a prompt for IDE handoff through clipboard plus configurable VS Code command IDs
- run deterministic `codex exec` iterations with preflight checks, verifier passes, stable artifacts, and explicit stop reasons

## Quick Start

1. Run `npm install`.
2. Run `npm run compile`.
3. Open the repo in VS Code and start the Extension Development Host with `F5`.
4. Use `Ralph Codex: Show Status` to inspect the current workspace state.
5. Use `Ralph Codex: Prepare Prompt`, `Ralph Codex: Open Codex IDE`, `Ralph Codex: Run CLI Iteration`, or `Ralph Codex: Run CLI Loop` depending on the workflow you want.

## Durable Files

Ralph keeps its durable state in the workspace:
 succeeded in 51ms:
# Boundaries

This document owns what Ralph Codex Workbench explicitly does not try to do and where its trust guarantees stop.

Related docs:

- [Architecture](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/architecture.md) for module shape
- [Provenance](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md) for trust-chain details
- [Verifier](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md) for stop and review semantics

## Codex Product Boundary

Supported paths:

- IDE handoff through clipboard plus `vscode.commands.executeCommand(...)`
- scripted automation through `codex exec`

Unsupported assumptions:

- direct composer injection
codex
I’ve confirmed T5 can stay thin: add handoff smoke coverage in the stub harness, document the explicit operator behaviors and remaining trust limits, and update the durable Ralph task state once the test gate passes. Before editing, I’m checking how the test build is wired so I don’t accidentally skip a needed compile target.
exec
/bin/bash -lc "sed -n '1,220p' ralph-codex-vscode-starter/tsconfig.test.json" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,220p' ralph-codex-vscode-starter/tsconfig.json" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "sed -n '1,220p' ralph-codex-vscode-starter/src/config/types.ts" in /home/admin/Documents/repos/Ralph succeeded in 50ms:
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "out-test",
    "rootDir": ".",
    "sourceMap": false
  },
  "include": [
    "src/**/*.ts",
    "test/**/*.ts"
  ]
}
 succeeded in 50ms:
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "rootDir": "src",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "moduleResolution": "node",
    "skipLibCheck": true,
    "types": ["node", "vscode"]
  },
  "include": ["src"]
}
 succeeded in 51ms:
export type CodexHandoffMode = 'ideCommand' | 'clipboard' | 'cliExec';

export type CodexApprovalMode = 'never' | 'on-request' | 'untrusted';

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export type RalphVerifierMode = 'validationCommand' | 'gitDiff' | 'taskState';

export type RalphGitCheckpointMode = 'off' | 'snapshot' | 'snapshotAndDiff';

export interface RalphCodexConfig {
  codexCommandPath: string;
  preferredHandoffMode: CodexHandoffMode;
  ralphIterationCap: number;
  verifierModes: RalphVerifierMode[];
  noProgressThreshold: number;
  repeatedFailureThreshold: number;
  artifactRetentionPath: string;
  provenanceBundleRetentionCount: number;
  gitCheckpointMode: RalphGitCheckpointMode;
codex
The test build does compile both `src` and `test`, so source edits will be exercised by `npm test` without a separate compile step. I’m moving to file edits now: first the stub harness so clipboard writes are observable, then the command-shell tests and the docs that own the IDE handoff behavior.
exec
/bin/bash -lc "sed -n '1,260p' ralph-codex-vscode-starter/src/config/readConfig.ts" in /home/admin/Documents/repos/Ralph succeeded in 51ms:
import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from './defaults';
import {
  CodexApprovalMode,
  CodexHandoffMode,
  CodexSandboxMode,
  RalphCodexConfig,
  RalphGitCheckpointMode,
  RalphVerifierMode
} from './types';

function readString(
  config: vscode.WorkspaceConfiguration,
  key: string,
  fallback: string,
  legacyKeys: string[] = []
): string {
  const value = config.get<string>(key);
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
exec
/bin/bash -lc "sed -n '1,260p' ralph-codex-vscode-starter/test/commandShell.smoke.test.ts" in /home/admin/Documents/repos/Ralph succeeded in 51ms:
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { activate } from '../src/extension';
import { vscodeTestHarness } from './support/vscodeTestHarness';

class MemoryMemento implements vscode.Memento {
  private readonly values = new Map<string, unknown>();

  public keys(): readonly string[] {
    return Array.from(this.values.keys());
  }

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    return this.values.has(key) ? this.values.get(key) as T : defaultValue;
file update
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -8,2 +8,3 @@
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
@@ -22,2 +23,3 @@
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
@@ -54,2 +56,7 @@
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
apply_patch(auto_approved=true) exited 0 in 10ms:
Success. Updated the following files:
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
file update:
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {

file update:
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {

file update
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -10,2 +10,3 @@
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
apply_patch(auto_approved=true) exited 0 in 9ms:
Success. Updated the following files:
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
file update:
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update:
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -63,2 +63,6 @@
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
@@ -155,2 +159,113 @@
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
apply_patch(auto_approved=true) exited 0 in 13ms:
Success. Updated the following files:
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
file update:
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update:
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/workflows.md
@@ -28,2 +28,9 @@
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
apply_patch(auto_approved=true) exited 0 in 13ms:
Success. Updated the following files:
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/workflows.md
file update:
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update:
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/testing.md
@@ -21,3 +21,3 @@
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
@@ -48,3 +48,4 @@
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
apply_patch(auto_approved=true) exited 0 in 14ms:
Success. Updated the following files:
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/testing.md
file update:
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update:
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md
@@ -75,4 +75,4 @@
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
apply_patch(auto_approved=true) exited 0 in 18ms:
Success. Updated the following files:
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md
file update:
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update:
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

codex
I’ve added the deterministic harness pieces and the new smoke scenarios for clipboard-only, IDE-command, fallback, and `cliExec` handoff behavior, plus the focused docs that own operator expectations. I’m running the extension test gate now to see whether the new assertions line up with the existing prompt artifact names and command messages.
exec
/bin/bash -lc 'npm test' in /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starterfile update:
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

 exited 1 in 2.56s:

> ralph-codex-workbench@0.1.0 compile:tests
> tsc -p ./tsconfig.test.json

✔ out-test/test/artifactStore.test.js (118.06204ms)
✔ out-test/test/cliExecStrategy.test.js (101.984164ms)
✖ out-test/test/commandShell.smoke.test.js (272.647446ms)
✔ out-test/test/docsValidator.test.js (211.216695ms)
✔ out-test/test/iterationEngine.integration.test.js (695.812124ms)
✔ out-test/test/loopLogic.test.js (96.698743ms)
✔ out-test/test/preflight.test.js (90.375333ms)
✔ out-test/test/promptBuilder.test.js (112.83939ms)
✔ out-test/test/stateManager.test.js (116.423053ms)
✔ out-test/test/statusReport.test.js (91.347097ms)
✔ out-test/test/taskFile.test.js (94.510415ms)
✔ out-test/test/verifier.test.js (113.712841ms)
✔ out-test/test/workspaceInspection.test.js (73.58479ms)
✔ out-test/test/workspaceScanner.test.js (89.463043ms)
✔ out-test/test/workspaceSupport.test.js (77.130477ms)
ℹ tests 15
codex
The test run is still active. I’m polling for the compiled suite result so I can fix any mismatched expectations before I touch the durable Ralph task state.
file update:
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

codex
One smoke file failed without surfacing the assertion in the aggregate output, so I’m running that file directly to get the exact mismatch. This should isolate whether the issue is a prompt filename assumption, a warning ordering detail, or a missing stub method.
exec
/bin/bash -lc 'node --require ./test/register-vscode-stub.cjs --test ./out-test/test/commandShell.smoke.test.js' in /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter exited 1 in 130ms:
✖ out-test/test/commandShell.smoke.test.js (169.972663ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 178.586974

✖ failing tests:

test at out-test/test/commandShell.smoke.test.js:1:1
✖ out-test/test/commandShell.smoke.test.js (169.972663ms)
  'test failed'
file update:
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

exec
/bin/bash -lc 'node --require ./test/register-vscode-stub.cjs --test --test-reporter=spec ./out-test/test/commandShell.smoke.test.js' in /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter exited 1 in 126ms:
✖ out-test/test/commandShell.smoke.test.js (165.186555ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 173.831931

✖ failing tests:

test at out-test/test/commandShell.smoke.test.js:1:1
✖ out-test/test/commandShell.smoke.test.js (165.186555ms)
  'test failed'
file update:
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

exec
/bin/bash -lc 'node --require ./test/register-vscode-stub.cjs ./out-test/test/commandShell.smoke.test.js' in /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter exited 1 in 81ms:
✖ Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable (8.775359ms)
✖ Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff (9.626059ms)
✔ Reveal Latest Provenance Bundle Directory reveals the newest bundle directory (4.190735ms)
✔ Reveal Latest Provenance Bundle Directory explains when no bundle exists yet (2.366848ms)
ℹ tests 12
ℹ suites 0
ℹ pass 8
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 104.62846

✖ failing tests:

test at out-test/test/commandShell.smoke.test.js:172:25
✖ Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands (8.508057ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
file update:
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..ce26d2a503f5e5a011ffae74d59d047474698e42
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,10 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +157,117 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

codex
The failures are narrow: the handoff message uses the real prompt filename in `.ralph/prompts/`, not the stable `latest-prompt.md` artifact copy. I’m adjusting the assertions to derive the generated prompt basename from disk so the tests stay deterministic without hard-coding the current prompt kind.
file update
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -67,2 +67,12 @@
 
+async function readGeneratedPromptName(rootPath: string): Promise<string> {
+  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
+  const generatedPrompt = promptFiles
+    .filter((entry) => entry.endsWith('.prompt.md'))
+    .sort()[0];
+
+  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
+  return generatedPrompt;
+}
+
 test.beforeEach(() => {
@@ -192,3 +202,6 @@
   assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
-  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
 });
@@ -215,3 +228,6 @@
   assert.equal(harness.state.warningMessages.length, 0);
-  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
 });
@@ -240,3 +256,3 @@
     harness.state.warningMessages[1]?.message ?? '',
-    'Prompt copied to the clipboard from latest-prompt.md. Open Codex manually and paste it.'
+    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
   );
@@ -267,3 +283,6 @@
   );
-  assert.equal(harness.state.infoMessages.at(-1)?.message ?? '', 'Prompt ready at latest-prompt.md.');
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
 });
apply_patch(auto_approved=true) exited 0 in 17ms:
Success. Updated the following files:
M /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
file update:
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..bae3c07606391aea9bd20d67dbcf6a01f6602e89
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,20 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
+async function readGeneratedPromptName(rootPath: string): Promise<string> {
+  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
+  const generatedPrompt = promptFiles
+    .filter((entry) => entry.endsWith('.prompt.md'))
+    .sort()[0];
+
+  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
+  return generatedPrompt;
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +167,126 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update:
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..bae3c07606391aea9bd20d67dbcf6a01f6602e89
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,20 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
+async function readGeneratedPromptName(rootPath: string): Promise<string> {
+  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
+  const generatedPrompt = promptFiles
+    .filter((entry) => entry.endsWith('.prompt.md'))
+    .sort()[0];
+
+  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
+  return generatedPrompt;
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +167,126 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

exec
/bin/bash -lc 'npm test' in /home/admin/Documents/repos/Ralph/ralph-codex-vscode-starterfile update:
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..bae3c07606391aea9bd20d67dbcf6a01f6602e89
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,20 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
+async function readGeneratedPromptName(rootPath: string): Promise<string> {
+  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
+  const generatedPrompt = promptFiles
+    .filter((entry) => entry.endsWith('.prompt.md'))
+    .sort()[0];
+
+  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
+  return generatedPrompt;
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +167,126 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

 succeeded in 2.71s:

> ralph-codex-workbench@0.1.0 compile:tests
> tsc -p ./tsconfig.test.json

✔ out-test/test/artifactStore.test.js (131.479633ms)
✔ out-test/test/cliExecStrategy.test.js (110.749541ms)
✔ out-test/test/commandShell.smoke.test.js (346.956637ms)
✔ out-test/test/docsValidator.test.js (232.054704ms)
✔ out-test/test/iterationEngine.integration.test.js (754.221427ms)
✔ out-test/test/loopLogic.test.js (101.770349ms)
✔ out-test/test/preflight.test.js (103.599525ms)
✔ out-test/test/promptBuilder.test.js (178.874001ms)
✔ out-test/test/stateManager.test.js (140.355358ms)
✔ out-test/test/statusReport.test.js (139.515258ms)
✔ out-test/test/taskFile.test.js (117.146721ms)
✔ out-test/test/verifier.test.js (145.836698ms)
✔ out-test/test/workspaceInspection.test.js (104.67424ms)
✔ out-test/test/workspaceScanner.test.js (118.957031ms)
✔ out-test/test/workspaceSupport.test.js (93.084988ms)
ℹ tests 15
codex
The failing assertions are patched. I’m rerunning the full `npm test` gate now to confirm the new handoff coverage passes alongside the existing integration suite, not just in isolation.
file update:
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..bae3c07606391aea9bd20d67dbcf6a01f6602e89
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,20 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
+async function readGeneratedPromptName(rootPath: string): Promise<string> {
+  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
+  const generatedPrompt = promptFiles
+    .filter((entry) => entry.endsWith('.prompt.md'))
+    .sort()[0];
+
+  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
+  return generatedPrompt;
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +167,126 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

codex
The validation gate passed cleanly. I’m updating the durable Ralph backlog and progress log now so a fresh session can see that T5 is complete and what evidence landed with it.
file update
M /home/admin/Documents/repos/Ralph/.ralph/tasks.json
@@ -35,4 +35,4 @@
       "title": "Cover clipboard and IDE handoff strategies with automated tests and explicit docs",
-      "status": "todo",
-      "notes": "The current test plan explicitly leaves clipboard and VS Code command handoff behavior uncovered.",
+      "status": "done",
+      "notes": "Added command-shell smoke coverage for prompt clipboard auto-copy plus Open Codex IDE clipboard-only, IDE-command, missing-command fallback, and cliExec-warning handoff paths, and documented the operator-facing handoff rules and remaining live-host gaps.",
       "validation": "cd ralph-codex-vscode-starter && npm test"
apply_patch(auto_approved=true) exited 0 in 19ms:
Success. Updated the following files:
M /home/admin/Documents/repos/Ralph/.ralph/tasks.json
file update:
diff --git a/.ralph/tasks.json b/.ralph/tasks.json
index fc875a6993a5e223941c53fd2fd67674569fbb86..9f11eb7ec4e2fea927da1fb8806be1fc5ce36074
--- a/.ralph/tasks.json
+++ b/.ralph/tasks.json
@@ -33,8 +33,8 @@
     {
       "id": "T5",
       "title": "Cover clipboard and IDE handoff strategies with automated tests and explicit docs",
-      "status": "todo",
-      "notes": "The current test plan explicitly leaves clipboard and VS Code command handoff behavior uncovered.",
+      "status": "done",
+      "notes": "Added command-shell smoke coverage for prompt clipboard auto-copy plus Open Codex IDE clipboard-only, IDE-command, missing-command fallback, and cliExec-warning handoff paths, and documented the operator-facing handoff rules and remaining live-host gaps.",
       "validation": "cd ralph-codex-vscode-starter && npm test"
     },
     {
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..bae3c07606391aea9bd20d67dbcf6a01f6602e89
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,20 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
+async function readGeneratedPromptName(rootPath: string): Promise<string> {
+  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
+  const generatedPrompt = promptFiles
+    .filter((entry) => entry.endsWith('.prompt.md'))
+    .sort()[0];
+
+  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
+  return generatedPrompt;
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +167,126 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update:
diff --git a/.ralph/tasks.json b/.ralph/tasks.json
index fc875a6993a5e223941c53fd2fd67674569fbb86..9f11eb7ec4e2fea927da1fb8806be1fc5ce36074
--- a/.ralph/tasks.json
+++ b/.ralph/tasks.json
@@ -33,8 +33,8 @@
     {
       "id": "T5",
       "title": "Cover clipboard and IDE handoff strategies with automated tests and explicit docs",
-      "status": "todo",
-      "notes": "The current test plan explicitly leaves clipboard and VS Code command handoff behavior uncovered.",
+      "status": "done",
+      "notes": "Added command-shell smoke coverage for prompt clipboard auto-copy plus Open Codex IDE clipboard-only, IDE-command, missing-command fallback, and cliExec-warning handoff paths, and documented the operator-facing handoff rules and remaining live-host gaps.",
       "validation": "cd ralph-codex-vscode-starter && npm test"
     },
     {
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..bae3c07606391aea9bd20d67dbcf6a01f6602e89
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,20 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
+async function readGeneratedPromptName(rootPath: string): Promise<string> {
+  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
+  const generatedPrompt = promptFiles
+    .filter((entry) => entry.endsWith('.prompt.md'))
+    .sort()[0];
+
+  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
+  return generatedPrompt;
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +167,126 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update
M /home/admin/Documents/repos/Ralph/.ralph/progress.md
@@ -7,2 +7,3 @@
 - Completed T4 by adding regression coverage for nested workspace root-selection candidates and prompt repo-context rendering so nested child repos remain visible in generated prompts.
+- Completed T5 by adding command-shell smoke coverage for prompt clipboard auto-copy and Open Codex IDE handoff modes, and by documenting the exact clipboard, IDE-command, fallback, and live-host testing boundaries.
 - Use this file for durable progress notes between fresh Codex runs.
apply_patch(auto_approved=true) exited 0 in 16ms:
Success. Updated the following files:
M /home/admin/Documents/repos/Ralph/.ralph/progress.md
file update:
diff --git a/.ralph/progress.md b/.ralph/progress.md
index 2358201a04a3d01fa7d48be2ff45f4b6005aaa2c..a3319d586c6db812f2173895a8bb0fcc61e3d716
--- a/.ralph/progress.md
+++ b/.ralph/progress.md
@@ -5,4 +5,5 @@
 - Replaced the seed backlog in `.ralph/tasks.json` with repo-specific work derived from the actual `ralph-codex-vscode-starter` extension surface and current coverage gaps.
 - Completed T3 by validating nested project-root selection for `ralph-codex-vscode-starter`, adding scanner/status regressions, and rebuilding the extension runtime artifacts.
 - Completed T4 by adding regression coverage for nested workspace root-selection candidates and prompt repo-context rendering so nested child repos remain visible in generated prompts.
+- Completed T5 by adding command-shell smoke coverage for prompt clipboard auto-copy and Open Codex IDE handoff modes, and by documenting the exact clipboard, IDE-command, fallback, and live-host testing boundaries.
 - Use this file for durable progress notes between fresh Codex runs.
diff --git a/.ralph/tasks.json b/.ralph/tasks.json
index fc875a6993a5e223941c53fd2fd67674569fbb86..9f11eb7ec4e2fea927da1fb8806be1fc5ce36074
--- a/.ralph/tasks.json
+++ b/.ralph/tasks.json
@@ -33,8 +33,8 @@
     {
       "id": "T5",
       "title": "Cover clipboard and IDE handoff strategies with automated tests and explicit docs",
-      "status": "todo",
-      "notes": "The current test plan explicitly leaves clipboard and VS Code command handoff behavior uncovered.",
+      "status": "done",
+      "notes": "Added command-shell smoke coverage for prompt clipboard auto-copy plus Open Codex IDE clipboard-only, IDE-command, missing-command fallback, and cliExec-warning handoff paths, and documented the operator-facing handoff rules and remaining live-host gaps.",
       "validation": "cd ralph-codex-vscode-starter && npm test"
     },
     {
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..bae3c07606391aea9bd20d67dbcf6a01f6602e89
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,20 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
+async function readGeneratedPromptName(rootPath: string): Promise<string> {
+  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
+  const generatedPrompt = promptFiles
+    .filter((entry) => entry.endsWith('.prompt.md'))
+    .sort()[0];
+
+  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
+  return generatedPrompt;
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +167,126 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

file update:
diff --git a/.ralph/progress.md b/.ralph/progress.md
index 2358201a04a3d01fa7d48be2ff45f4b6005aaa2c..a3319d586c6db812f2173895a8bb0fcc61e3d716
--- a/.ralph/progress.md
+++ b/.ralph/progress.md
@@ -5,4 +5,5 @@
 - Replaced the seed backlog in `.ralph/tasks.json` with repo-specific work derived from the actual `ralph-codex-vscode-starter` extension surface and current coverage gaps.
 - Completed T3 by validating nested project-root selection for `ralph-codex-vscode-starter`, adding scanner/status regressions, and rebuilding the extension runtime artifacts.
 - Completed T4 by adding regression coverage for nested workspace root-selection candidates and prompt repo-context rendering so nested child repos remain visible in generated prompts.
+- Completed T5 by adding command-shell smoke coverage for prompt clipboard auto-copy and Open Codex IDE handoff modes, and by documenting the exact clipboard, IDE-command, fallback, and live-host testing boundaries.
 - Use this file for durable progress notes between fresh Codex runs.
diff --git a/.ralph/tasks.json b/.ralph/tasks.json
index fc875a6993a5e223941c53fd2fd67674569fbb86..9f11eb7ec4e2fea927da1fb8806be1fc5ce36074
--- a/.ralph/tasks.json
+++ b/.ralph/tasks.json
@@ -33,8 +33,8 @@
     {
       "id": "T5",
       "title": "Cover clipboard and IDE handoff strategies with automated tests and explicit docs",
-      "status": "todo",
-      "notes": "The current test plan explicitly leaves clipboard and VS Code command handoff behavior uncovered.",
+      "status": "done",
+      "notes": "Added command-shell smoke coverage for prompt clipboard auto-copy plus Open Codex IDE clipboard-only, IDE-command, missing-command fallback, and cliExec-warning handoff paths, and documented the operator-facing handoff rules and remaining live-host gaps.",
       "validation": "cd ralph-codex-vscode-starter && npm test"
     },
     {
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..bae3c07606391aea9bd20d67dbcf6a01f6602e89
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,20 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
+async function readGeneratedPromptName(rootPath: string): Promise<string> {
+  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
+  const generatedPrompt = promptFiles
+    .filter((entry) => entry.endsWith('.prompt.md'))
+    .sort()[0];
+
+  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
+  return generatedPrompt;
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +167,126 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

exec
/bin/bash -lc "nl -ba .ralph/tasks.json | sed -n '20,60p'" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "nl -ba .ralph/progress.md | sed -n '1,40p'" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "nl -ba ralph-codex-vscode-starter/test/commandShell.smoke.test.ts | sed -n '1,280p'" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "nl -ba ralph-codex-vscode-starter/test/register-vscode-stub.cjs | sed -n '1,220p'" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "nl -ba ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts | sed -n '1,120p'" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "nl -ba ralph-codex-vscode-starter/docs/workflows.md | sed -n '1,120p'" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "nl -ba ralph-codex-vscode-starter/docs/testing.md | sed -n '1,160p'" in /home/admin/Documents/repos/Ralphexec
/bin/bash -lc "nl -ba ralph-codex-vscode-starter/docs/boundaries.md | sed -n '1,120p'" in /home/admin/Documents/repos/Ralph succeeded in 52ms:
    20	      "notes": "Workspace scanning now selects the nested `ralph-codex-vscode-starter` project root when the repo root has no shallow markers, and the runtime build was refreshed so the extension uses the updated scan path.",
    21	      "validation": "cd ralph-codex-vscode-starter && npm test"
    22	    },
    23	    {
    24	      "id": "T4",
    25	      "title": "Add regression coverage for nested workspace scanning and prompt repo-context rendering",
    26	      "status": "done",
    27	      "dependsOn": [
    28	        "T3"
    29	      ],
    30	      "notes": "Locked in nested root-selection evidence plus prompt repo-context rendering for inspected-root versus workspace-root cases.",
    31	      "validation": "cd ralph-codex-vscode-starter && npm test"
    32	    },
    33	    {
    34	      "id": "T5",
    35	      "title": "Cover clipboard and IDE handoff strategies with automated tests and explicit docs",
    36	      "status": "done",
    37	      "notes": "Added command-shell smoke coverage for prompt clipboard auto-copy plus Open Codex IDE clipboard-only, IDE-command, missing-command fallback, and cliExec-warning handoff paths, and documented the operator-facing handoff rules and remaining live-host gaps.",
    38	      "validation": "cd ralph-codex-vscode-starter && npm test"
    39	    },
 succeeded in 50ms:
     1	# Progress
     2	
     3	- Ralph workspace initialized.
     4	- Refined `.ralph/prd.md` into a concrete objective for a durable, file-backed multi-agent delivery framework spanning requirements, implementation, testing, and orchestration.
     5	- Replaced the seed backlog in `.ralph/tasks.json` with repo-specific work derived from the actual `ralph-codex-vscode-starter` extension surface and current coverage gaps.
     6	- Completed T3 by validating nested project-root selection for `ralph-codex-vscode-starter`, adding scanner/status regressions, and rebuilding the extension runtime artifacts.
     7	- Completed T4 by adding regression coverage for nested workspace root-selection candidates and prompt repo-context rendering so nested child repos remain visible in generated prompts.
     8	- Completed T5 by adding command-shell smoke coverage for prompt clipboard auto-copy and Open Codex IDE handoff modes, and by documenting the exact clipboard, IDE-command, fallback, and live-host testing boundaries.
     9	- Use this file for durable progress notes between fresh Codex runs.
 succeeded in 51ms:
     1	import assert from 'node:assert/strict';
     2	import * as fs from 'node:fs/promises';
     3	import * as os from 'node:os';
     4	import * as path from 'node:path';
     5	import test from 'node:test';
     6	import * as vscode from 'vscode';
     7	import { activate } from '../src/extension';
     8	import { vscodeTestHarness } from './support/vscodeTestHarness';
     9	
    10	class MemoryMemento implements vscode.Memento {
    11	  private readonly values = new Map<string, unknown>();
    12	
    13	  public keys(): readonly string[] {
    14	    return Array.from(this.values.keys());
    15	  }
    16	
    17	  public get<T>(key: string): T | undefined;
    18	  public get<T>(key: string, defaultValue: T): T;
    19	  public get<T>(key: string, defaultValue?: T): T | undefined {
    20	    return this.values.has(key) ? this.values.get(key) as T : defaultValue;
 succeeded in 50ms:
     1	const fs = require('node:fs');
     2	const Module = require('node:module');
     3	
     4	const state = {
     5	  configuration: {},
     6	  workspaceFolders: [],
     7	  isTrusted: true,
     8	  availableCommands: [],
     9	  clipboardText: '',
    10	  infoMessages: [],
    11	  warningMessages: [],
    12	  errorMessages: [],
    13	  shownDocuments: [],
    14	  executedCommands: [],
    15	  inputBoxValue: undefined,
    16	  messageChoice: undefined
    17	};
    18	
    19	function reset() {
    20	  state.configuration = {};
 succeeded in 52ms:
     1	# Workflows
     2	
     3	This document owns operator-facing command flows. Semantic rules for invariants, provenance, verifier behavior, and boundaries live in the focused docs linked below.
     4	
     5	Related docs:
     6	
     7	- [Invariants](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/invariants.md)
     8	- [Provenance](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md)
     9	- [Verifier](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md)
    10	- [Boundaries](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md)
    11	
    12	## Develop The Extension
    13	
    14	1. Run `npm install`.
    15	2. Run `npm run compile`.
    16	3. Start the Extension Development Host with `F5`.
    17	4. Re-run `npm run compile` after TypeScript changes, or use `npm run watch`.
    18	
    19	Use [docs/testing.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/testing.md) for the validation gate and test coverage.
    20	
 succeeded in 53ms:
     1	export interface VscodeMessageCall {
     2	  message: string;
     3	  items: string[];
     4	}
     5	
     6	export interface VscodeStubState {
     7	  configuration: Record<string, unknown>;
     8	  workspaceFolders: unknown[];
     9	  isTrusted: boolean;
    10	  availableCommands: string[];
    11	  clipboardText: string;
    12	  infoMessages: VscodeMessageCall[];
    13	  warningMessages: VscodeMessageCall[];
    14	  errorMessages: VscodeMessageCall[];
    15	  shownDocuments: Array<string | null>;
    16	  executedCommands: Array<{ command: string; args: unknown[] }>;
    17	  inputBoxValue?: string;
    18	  messageChoice?: string;
    19	}
    20	
 succeeded in 50ms:
     1	# Testing
     2	
     3	Related docs:
     4	
     5	- [README.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/README.md)
     6	- [docs/architecture.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/architecture.md)
     7	- [docs/workflows.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/workflows.md)
     8	- [docs/verifier.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md)
     9	
    10	## Authoritative Commands
    11	
    12	- `npm run compile`: build the extension from `src/` to `out/`.
    13	- `npm run lint`: type-check `src/` and `test/` without emitting files.
    14	- `npm run check:docs`: run deterministic documentation structure, link, ownership, and lightweight code-doc alignment checks.
    15	- `npm test`: run `npm run compile:tests` and then execute the Node test suite from `out-test/test/`.
    16	- `npm run test:activation`: launch a real Extension Development Host smoke test through `@vscode/test-electron`.
    17	- `npm run validate`: run `compile`, `check:docs`, `lint`, and `test`.
    18	- `npm run package`: verify the Node runtime and then build a `.vsix` package with `vsce`.
    19	
    20	## What Is Covered
 succeeded in 50ms:
     1	# Boundaries
     2	
     3	This document owns what Ralph Codex Workbench explicitly does not try to do and where its trust guarantees stop.
     4	
     5	Related docs:
     6	
     7	- [Architecture](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/architecture.md) for module shape
     8	- [Provenance](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/provenance.md) for trust-chain details
     9	- [Verifier](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/verifier.md) for stop and review semantics
    10	
    11	## Codex Product Boundary
    12	
    13	Supported paths:
    14	
    15	- IDE handoff through clipboard plus `vscode.commands.executeCommand(...)`
    16	- scripted automation through `codex exec`
    17	
    18	Unsupported assumptions:
    19	
    20	- direct composer injection
file update:
diff --git a/.ralph/progress.md b/.ralph/progress.md
index 2358201a04a3d01fa7d48be2ff45f4b6005aaa2c..a3319d586c6db812f2173895a8bb0fcc61e3d716
--- a/.ralph/progress.md
+++ b/.ralph/progress.md
@@ -5,4 +5,5 @@
 - Replaced the seed backlog in `.ralph/tasks.json` with repo-specific work derived from the actual `ralph-codex-vscode-starter` extension surface and current coverage gaps.
 - Completed T3 by validating nested project-root selection for `ralph-codex-vscode-starter`, adding scanner/status regressions, and rebuilding the extension runtime artifacts.
 - Completed T4 by adding regression coverage for nested workspace root-selection candidates and prompt repo-context rendering so nested child repos remain visible in generated prompts.
+- Completed T5 by adding command-shell smoke coverage for prompt clipboard auto-copy and Open Codex IDE handoff modes, and by documenting the exact clipboard, IDE-command, fallback, and live-host testing boundaries.
 - Use this file for durable progress notes between fresh Codex runs.
diff --git a/.ralph/tasks.json b/.ralph/tasks.json
index fc875a6993a5e223941c53fd2fd67674569fbb86..9f11eb7ec4e2fea927da1fb8806be1fc5ce36074
--- a/.ralph/tasks.json
+++ b/.ralph/tasks.json
@@ -33,8 +33,8 @@
     {
       "id": "T5",
       "title": "Cover clipboard and IDE handoff strategies with automated tests and explicit docs",
-      "status": "todo",
-      "notes": "The current test plan explicitly leaves clipboard and VS Code command handoff behavior uncovered.",
+      "status": "done",
+      "notes": "Added command-shell smoke coverage for prompt clipboard auto-copy plus Open Codex IDE clipboard-only, IDE-command, missing-command fallback, and cliExec-warning handoff paths, and documented the operator-facing handoff rules and remaining live-host gaps.",
       "validation": "cd ralph-codex-vscode-starter && npm test"
     },
     {
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..bae3c07606391aea9bd20d67dbcf6a01f6602e89
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,20 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
+async function readGeneratedPromptName(rootPath: string): Promise<string> {
+  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
+  const generatedPrompt = promptFiles
+    .filter((entry) => entry.endsWith('.prompt.md'))
+    .sort()[0];
+
+  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
+  return generatedPrompt;
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +167,126 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

exec
/bin/bash -lc 'git diff --name-only -- .ralph/tasks.json .ralph/progress.md ralph-codex-vscode-starter/test/commandShell.smoke.test.ts ralph-codex-vscode-starter/test/register-vscode-stub.cjs ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts ralph-codex-vscode-starter/docs/workflows.md ralph-codex-vscode-starter/docs/testing.md ralph-codex-vscode-starter/docs/boundaries.md' in /home/admin/Documents/repos/Ralph succeeded in 51ms:
.ralph/progress.md
.ralph/tasks.json
ralph-codex-vscode-starter/docs/boundaries.md
ralph-codex-vscode-starter/docs/testing.md
ralph-codex-vscode-starter/docs/workflows.md
ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
ralph-codex-vscode-starter/test/register-vscode-stub.cjs
ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
file update:
diff --git a/.ralph/progress.md b/.ralph/progress.md
index 2358201a04a3d01fa7d48be2ff45f4b6005aaa2c..a3319d586c6db812f2173895a8bb0fcc61e3d716
--- a/.ralph/progress.md
+++ b/.ralph/progress.md
@@ -5,4 +5,5 @@
 - Replaced the seed backlog in `.ralph/tasks.json` with repo-specific work derived from the actual `ralph-codex-vscode-starter` extension surface and current coverage gaps.
 - Completed T3 by validating nested project-root selection for `ralph-codex-vscode-starter`, adding scanner/status regressions, and rebuilding the extension runtime artifacts.
 - Completed T4 by adding regression coverage for nested workspace root-selection candidates and prompt repo-context rendering so nested child repos remain visible in generated prompts.
+- Completed T5 by adding command-shell smoke coverage for prompt clipboard auto-copy and Open Codex IDE handoff modes, and by documenting the exact clipboard, IDE-command, fallback, and live-host testing boundaries.
 - Use this file for durable progress notes between fresh Codex runs.
diff --git a/.ralph/tasks.json b/.ralph/tasks.json
index fc875a6993a5e223941c53fd2fd67674569fbb86..9f11eb7ec4e2fea927da1fb8806be1fc5ce36074
--- a/.ralph/tasks.json
+++ b/.ralph/tasks.json
@@ -33,8 +33,8 @@
     {
       "id": "T5",
       "title": "Cover clipboard and IDE handoff strategies with automated tests and explicit docs",
-      "status": "todo",
-      "notes": "The current test plan explicitly leaves clipboard and VS Code command handoff behavior uncovered.",
+      "status": "done",
+      "notes": "Added command-shell smoke coverage for prompt clipboard auto-copy plus Open Codex IDE clipboard-only, IDE-command, missing-command fallback, and cliExec-warning handoff paths, and documented the operator-facing handoff rules and remaining live-host gaps.",
       "validation": "cd ralph-codex-vscode-starter && npm test"
     },
     {
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..bae3c07606391aea9bd20d67dbcf6a01f6602e89
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,20 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
+async function readGeneratedPromptName(rootPath: string): Promise<string> {
+  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
+  const generatedPrompt = promptFiles
+    .filter((entry) => entry.endsWith('.prompt.md'))
+    .sort()[0];
+
+  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
+  return generatedPrompt;
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +167,126 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

codex
**Changed**
Added deterministic handoff coverage in the stub smoke suite so clipboard and IDE-command flows are now exercised end to end in tests: [commandShell.smoke.test.ts](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts#L64), [register-vscode-stub.cjs](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/register-vscode-stub.cjs#L4), [vscodeTestHarness.ts](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts#L6). The new cases cover prompt clipboard auto-copy, `Open Codex IDE` in `clipboard` mode, `ideCommand` mode with successful command execution, missing-command fallback warnings, and the `cliExec` warning-only fallback.

Documented the operator-facing handoff rules and remaining live-host limits in [workflows.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/workflows.md#L21), [testing.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/testing.md#L20), and [boundaries.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md#L70). Updated durable Ralph state to mark T5 complete in [tasks.json](/home/admin/Documents/repos/Ralph/.ralph/tasks.json#L33) and [progress.md](/home/admin/Documents/repos/Ralph/.ralph/progress.md#L3).

**Validation**
Ran `cd ralph-codex-vscode-starter && npm test` and it passed: 15 tests, 0 failures.

**Assumptions / Limitations**
No blockers. I left the pre-existing unrelated dirty worktree state intact. Remaining gap is still real host verification for clipboard and VS Code command handoff; the new coverage is deterministic stub smoke, not live Extension Development Host UI automation.
file update:
diff --git a/.ralph/progress.md b/.ralph/progress.md
index 2358201a04a3d01fa7d48be2ff45f4b6005aaa2c..a3319d586c6db812f2173895a8bb0fcc61e3d716
--- a/.ralph/progress.md
+++ b/.ralph/progress.md
@@ -5,4 +5,5 @@
 - Replaced the seed backlog in `.ralph/tasks.json` with repo-specific work derived from the actual `ralph-codex-vscode-starter` extension surface and current coverage gaps.
 - Completed T3 by validating nested project-root selection for `ralph-codex-vscode-starter`, adding scanner/status regressions, and rebuilding the extension runtime artifacts.
 - Completed T4 by adding regression coverage for nested workspace root-selection candidates and prompt repo-context rendering so nested child repos remain visible in generated prompts.
+- Completed T5 by adding command-shell smoke coverage for prompt clipboard auto-copy and Open Codex IDE handoff modes, and by documenting the exact clipboard, IDE-command, fallback, and live-host testing boundaries.
 - Use this file for durable progress notes between fresh Codex runs.
diff --git a/.ralph/tasks.json b/.ralph/tasks.json
index fc875a6993a5e223941c53fd2fd67674569fbb86..9f11eb7ec4e2fea927da1fb8806be1fc5ce36074
--- a/.ralph/tasks.json
+++ b/.ralph/tasks.json
@@ -33,8 +33,8 @@
     {
       "id": "T5",
       "title": "Cover clipboard and IDE handoff strategies with automated tests and explicit docs",
-      "status": "todo",
-      "notes": "The current test plan explicitly leaves clipboard and VS Code command handoff behavior uncovered.",
+      "status": "done",
+      "notes": "Added command-shell smoke coverage for prompt clipboard auto-copy plus Open Codex IDE clipboard-only, IDE-command, missing-command fallback, and cliExec-warning handoff paths, and documented the operator-facing handoff rules and remaining live-host gaps.",
       "validation": "cd ralph-codex-vscode-starter && npm test"
     },
     {
diff --git a/ralph-codex-vscode-starter/docs/boundaries.md b/ralph-codex-vscode-starter/docs/boundaries.md
index 5129ddb8ffec002362c448ee8b999f8fecc05ab9..1e5e7eadf1ed5d5d22461c9df4a4f1faf67ef007
--- a/ralph-codex-vscode-starter/docs/boundaries.md
+++ b/ralph-codex-vscode-starter/docs/boundaries.md
@@ -73,8 +73,8 @@
 
 The repo does not currently try to prove through automated tests:
 
-- live clipboard handoff behavior
-- live VS Code command handoff behavior
+- live clipboard handoff behavior in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - real `codex exec` execution against the Codex service
 - heavy Extension Development Host UI automation
 
diff --git a/ralph-codex-vscode-starter/docs/testing.md b/ralph-codex-vscode-starter/docs/testing.md
index e18af7fb11fbf141874254adf05448d647386eef..9b1bb63082e8d6757d90faba36e64d38de858bd2
--- a/ralph-codex-vscode-starter/docs/testing.md
+++ b/ralph-codex-vscode-starter/docs/testing.md
@@ -19,7 +19,7 @@
 
 ## What Is Covered
 
-- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, and latest-bundle reveal behavior with mocked Ralph state/artifacts.
+- `test/commandShell.smoke.test.ts`: lightweight extension-shell smoke coverage for key command registration plus `Show Status`, latest-summary/latest-provenance commands, latest-bundle reveal behavior, prompt clipboard auto-copy, and `Open Codex IDE` handoff behavior across clipboard-only, IDE-command, missing-command fallback, and `cliExec` warning modes with mocked Ralph state/artifacts.
 - `test/artifactStore.test.ts`: targeted retention cleanup coverage proving protected bundles survive cleanup when a latest pointer still references them.
 - `test/vscode/runActivationSmoke.ts` and `test/vscode/suite/index.ts`: optional real activation smoke coverage for extension activation, command registration, and one basic command invocation in a real Extension Development Host.
 - `test/promptBuilder.test.ts`: deterministic prompt-kind selection, file-based template rendering, verifier-informed prompt refinement, prior-context trimming, and prompt-output determinism.
@@ -46,7 +46,8 @@
 ## What Is Not Covered
 
 - heavy Extension Development Host UI automation beyond lightweight command-shell smoke coverage
-- Clipboard and VS Code command handoff strategies
+- live clipboard integration in a real host OS session
+- live VS Code command handoff behavior in a real Extension Development Host session
 - Real `codex exec` process execution
 - Live Git checkpoint behavior in a real repository
 - `.vsix` install behavior
diff --git a/ralph-codex-vscode-starter/docs/workflows.md b/ralph-codex-vscode-starter/docs/workflows.md
index 9609662bca358fd6c0e141b6ae0684bee277a1d3..5e66ab17ad594485dc430d3a829da74d0ebcdca4
--- a/ralph-codex-vscode-starter/docs/workflows.md
+++ b/ralph-codex-vscode-starter/docs/workflows.md
@@ -26,6 +26,13 @@
 
 This path persists prepared-prompt evidence, not a full executed iteration result.
 
+Handoff behavior on this path is intentionally explicit:
+
+- `Prepare Prompt` writes the prompt to disk every time and also copies it to the clipboard when `ralphCodex.clipboardAutoCopy = true`.
+- `Open Codex IDE` with `preferredHandoffMode = clipboard` copies the prompt only. It does not execute `openSidebarCommandId` or `newChatCommandId`.
+- `Open Codex IDE` with `preferredHandoffMode = ideCommand` copies the prompt and then best-effort runs the configured VS Code command IDs. If either command is missing or throws, Ralph warns and tells the operator to open Codex manually and paste the prepared prompt.
+- `Open Codex IDE` with `preferredHandoffMode = cliExec` still stays on clipboard handoff for this command and warns to use `Run CLI Iteration` for real `codex exec` automation.
+
 Artifacts written on this path include:
 
 - `prompt.md`
diff --git a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
index a922db3baa4fd54d65214a0871a5e0fa274698be..bae3c07606391aea9bd20d67dbcf6a01f6602e89
--- a/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
+++ b/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts
@@ -61,6 +61,20 @@
   }, null, 2), 'utf8');
 }
 
+async function readLatestPrompt(rootPath: string): Promise<string> {
+  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
+}
+
+async function readGeneratedPromptName(rootPath: string): Promise<string> {
+  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
+  const generatedPrompt = promptFiles
+    .filter((entry) => entry.endsWith('.prompt.md'))
+    .sort()[0];
+
+  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
+  return generatedPrompt;
+}
+
 test.beforeEach(() => {
   const harness = vscodeTestHarness();
   harness.reset();
@@ -153,6 +167,126 @@
   assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
 });
 
+test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({ clipboardAutoCopy: true });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.generatePrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.warningMessages.length, 0);
+});
+
+test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'clipboard',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
+  assert.equal(harness.state.warningMessages.length, 0);
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
+test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'ideCommand',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.match(
+    harness.state.warningMessages[0]?.message ?? '',
+    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
+  );
+  assert.equal(
+    harness.state.warningMessages[1]?.message ?? '',
+    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
+  );
+});
+
+test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
+  const rootPath = await makeTempRoot();
+  await seedWorkspace(rootPath);
+
+  const harness = vscodeTestHarness();
+  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
+  harness.setConfiguration({
+    preferredHandoffMode: 'cliExec',
+    openSidebarCommandId: 'chatgpt.openSidebar',
+    newChatCommandId: 'chatgpt.newChat'
+  });
+  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);
+
+  activate(createExtensionContext());
+  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');
+
+  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
+  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
+  assert.equal(
+    harness.state.warningMessages[0]?.message ?? '',
+    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
+  );
+  assert.equal(
+    harness.state.infoMessages.at(-1)?.message ?? '',
+    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
+  );
+});
+
 test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
   const rootPath = await makeTempRoot();
   await seedWorkspace(rootPath);
diff --git a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
index 967eaf5fc89033de7716c21570464bf469283ede..cdc0731735db1e7cc387346e5413e780304da5eb
--- a/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
+++ b/ralph-codex-vscode-starter/test/register-vscode-stub.cjs
@@ -6,6 +6,7 @@
   workspaceFolders: [],
   isTrusted: true,
   availableCommands: [],
+  clipboardText: '',
   infoMessages: [],
   warningMessages: [],
   errorMessages: [],
@@ -20,6 +21,7 @@
   state.workspaceFolders = [];
   state.isTrusted = true;
   state.availableCommands = [];
+  state.clipboardText = '';
   state.infoMessages = [];
   state.warningMessages = [];
   state.errorMessages = [];
@@ -52,6 +54,11 @@
     }
   },
   env: {
+    clipboard: {
+      async writeText(value) {
+        state.clipboardText = String(value);
+      }
+    },
     openExternal: async () => true
   },
   commands: {
diff --git a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
index c0bc4cb4430d24a442f622bcd35d04c009a83663..9565a3c6fc2799d0d66b720acb2935c79a8b595f
--- a/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
+++ b/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts
@@ -8,6 +8,7 @@
   workspaceFolders: unknown[];
   isTrusted: boolean;
   availableCommands: string[];
+  clipboardText: string;
   infoMessages: VscodeMessageCall[];
   warningMessages: VscodeMessageCall[];
   errorMessages: VscodeMessageCall[];

tokens used
67,240


## Last Message

**Changed**
Added deterministic handoff coverage in the stub smoke suite so clipboard and IDE-command flows are now exercised end to end in tests: [commandShell.smoke.test.ts](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/commandShell.smoke.test.ts#L64), [register-vscode-stub.cjs](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/register-vscode-stub.cjs#L4), [vscodeTestHarness.ts](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/test/support/vscodeTestHarness.ts#L6). The new cases cover prompt clipboard auto-copy, `Open Codex IDE` in `clipboard` mode, `ideCommand` mode with successful command execution, missing-command fallback warnings, and the `cliExec` warning-only fallback.

Documented the operator-facing handoff rules and remaining live-host limits in [workflows.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/workflows.md#L21), [testing.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/testing.md#L20), and [boundaries.md](/home/admin/Documents/repos/Ralph/ralph-codex-vscode-starter/docs/boundaries.md#L70). Updated durable Ralph state to mark T5 complete in [tasks.json](/home/admin/Documents/repos/Ralph/.ralph/tasks.json#L33) and [progress.md](/home/admin/Documents/repos/Ralph/.ralph/progress.md#L3).

**Validation**
Ran `cd ralph-codex-vscode-starter && npm test` and it passed: 15 tests, 0 failures.

**Assumptions / Limitations**
No blockers. I left the pre-existing unrelated dirty worktree state intact. Remaining gap is still real host verification for clipboard and VS Code command handoff; the new coverage is deterministic stub smoke, not live Extension Development Host UI automation.

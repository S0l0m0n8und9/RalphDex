# Remove Three Low-Value Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Construct Recommended Skills, Named Multi-Project Workspace Management, and Pipeline Resume / Human-Gate Checkpoint Layer — all dead weight relative to Ralphdex's core loop, provenance, and IDE handoff value.

**Architecture:** Three independent removal chains, ordered by blast radius (smallest first). Each chain touches `package.json`, one or more source files, test files, and docs. The `runPipeline` command itself is kept; only the resume and human-gate layers around it are removed.

**Tech Stack:** TypeScript, VS Code Extension API, Jest/ts-jest. Validate with `npm run validate` (compile + docs-check + lint + tests).

---

## File Structure

Files modified (not created):

| File | Changes |
|------|---------|
| `package.json` | Remove 6 activation events, 6 command contributions, 1 config property |
| `src/commands/registerCommands.ts` | Remove 5 helpers, 5 command handlers, 1 activation-time block, prune 2 imports blocks, remove human-gate lines from `runPipelineFromPhase` |
| `src/ralph/projectGenerator.ts` | Remove `RecommendedSkill` interface, `recommendedSkills` field from return type and parsing |
| `src/webview/prdCreationWizardHost.ts` | Remove skill selection state types, toggle handler, renderer, path output |
| `src/commands/prdWizardPersistence.ts` | Remove `recommendedSkillsPath` from `PrdWizardWritePaths`, remove skill-write logic |
| `src/ralph/pipeline.ts` | Remove `PipelinePendingHandoff`, handoff read/write helpers, `findResumablePipelineArtifacts`, `RESUMABLE_PHASES`, `awaiting_human_approval` from status type |
| `src/ralph/orchestrationSupervisor.ts` | Remove `humanGateArtifactPath`, `writeHumanGateArtifact`, `clearHumanGateArtifact`, `checkContestedFanInScmGate`, `pipelineHumanGates` param, all gate-writing conditionals |
| `src/ralph/types.ts` | Remove `HumanGateType`, `HumanGateArtifact` |
| `src/config/types.ts` | Remove `pipelineHumanGates: boolean` |
| `src/config/defaults.ts` | Remove `pipelineHumanGates: false` |
| `src/config/readConfig.ts` | Remove `pipelineHumanGates` read line |
| `test/humanGates.test.ts` | Delete entirely |
| `test/pipeline.test.ts` | Remove handoff + findResumable imports and test blocks |
| `test/prdWizardPersistence.test.ts` | Remove recommended-skills path setup and the skills-rewrite test |
| `test/commandShell.smoke.test.ts` | Remove constructRecommendedSkills tests, newProject / newProjectWizard / switchProject tests, runPipeline human-gate test |
| `test/packageManifest.test.ts` | Remove tests for newProjectWizard, pipelineHumanGates, approveHumanReview, constructRecommendedSkills |
| `test/readConfig.test.ts` | Remove `pipelineHumanGates` assertion |
| `test/docsValidator.test.ts` | Remove `pipelineHumanGates` fixture entries |
| `test/projectGenerator.test.ts` | Remove `recommendedSkills` assertions |
| `docs/workflows.md` | Remove/condense pipeline-resume, human-gate, multi-project, and recommended-skills sections |
| `README.md` | Remove the 6 commands from the command listing |

---

## Task 1: Remove Feature 1 from `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove the activation event**

  Find and delete this line from the `activationEvents` array:
  ```json
  "onCommand:ralphCodex.constructRecommendedSkills",
  ```

- [ ] **Step 2: Remove the command contribution**

  Find and delete this block from `contributes.commands`:
  ```json
  {
    "command": "ralphCodex.constructRecommendedSkills",
    "title": "Ralphdex: Construct Recommended Skills"
  },
  ```

- [ ] **Step 3: Run validate to confirm json and compile still pass**

  ```bash
  npm run validate
  ```
  Expected: PASS (code referencing the command still exists; this step just confirms JSON is valid)

---

## Task 2: Remove Feature 1 command handler from `registerCommands.ts`

**Files:**
- Modify: `src/commands/registerCommands.ts`

- [ ] **Step 1: Remove the `RecommendedSkill` import**

  Find and delete this import line (near top of file):
  ```typescript
  import type { RecommendedSkill } from '../ralph/projectGenerator';
  ```

- [ ] **Step 2: Remove the command handler block**

  Find and delete the entire block (search for the comment to locate it):
  ```typescript
    // ---------- Construct Recommended Skills ----------
    registerCommand(context, logger, {
      commandId: 'ralphCodex.constructRecommendedSkills',
      ...
    });
  ```
  The block runs from the comment line to the closing `});` — approximately 90 lines.

- [ ] **Step 3: Remove recommended-skills generation from `initializeWorkspace`**

  In the `initializeWorkspace` handler, find and remove these two steps:

  a) Remove `recommendedSkillsPath` from the paths object passed to the wizard (the line starting with `recommendedSkillsPath`).

  b) Find and remove the block that writes `recommended-skills.json` after project generation:
  ```typescript
  if (generated.recommendedSkills.length > 0) {
    const skillsPath = ...recommendedSkills...
    await fs.writeFile(skillsPath, `${JSON.stringify(generated.recommendedSkills, null, 2)}\n`, 'utf8');
    logger.info('Wrote recommended-skills.json.', { skillCount: generated.recommendedSkills.length });
  }
  ```

- [ ] **Step 4: Compile to catch errors**

  ```bash
  npx tsc --noEmit
  ```
  Expected: errors in `prdWizardPersistence.ts`, `prdCreationWizardHost.ts`, `projectGenerator.ts` — handled in Task 3.

---

## Task 3: Remove Feature 1 from `projectGenerator.ts`, `prdWizardPersistence.ts`, `prdCreationWizardHost.ts`

**Files:**
- Modify: `src/ralph/projectGenerator.ts`
- Modify: `src/commands/prdWizardPersistence.ts`
- Modify: `src/webview/prdCreationWizardHost.ts`

- [ ] **Step 1: Prune `projectGenerator.ts`**

  a) Remove the `RecommendedSkill` interface (typically 4–5 lines):
  ```typescript
  export interface RecommendedSkill {
    name: string;
    description: string;
    rationale?: string | null;
  }
  ```

  b) Remove `recommendedSkills: RecommendedSkill[]` from the `generateProjectDraft` return type interface.

  c) Find and remove the `recommendedSkills` parsing block inside `parseProjectGenerationResponse` (or similar function name). It is a loop that builds a `recommendedSkills` array from `parsedObj.recommendedSkills`.

  d) Remove `recommendedSkills` from the return statement and from the prompt template string (the `"recommendedSkills": [...]` example in the template).

  e) Remove `recommendedSkills` from the `generateProjectDraft` return type annotation at the function signature level.

- [ ] **Step 2: Prune `prdWizardPersistence.ts`**

  a) Remove `recommendedSkillsPath: string` from `PrdWizardWritePaths`.

  b) Remove the skill-write block from `writePrdWizardDraft`:
  ```typescript
  const selectedSkills = draft.recommendedSkills
    .filter(...)
  const skippedSkills = draft.recommendedSkills
    .filter(...)
  await fs.writeFile(paths.recommendedSkillsPath, ...);
  filesWritten.push(paths.recommendedSkillsPath);
  ```

- [ ] **Step 3: Prune `prdCreationWizardHost.ts`**

  a) Remove `PrdWizardSkillSelection` interface (extends `RecommendedSkill`).

  b) Remove `recommendedSkills: PrdWizardSkillSelection[]` from the draft state type.

  c) Remove `recommendedSkillsPath?: string` from the paths state type.

  d) Remove all `recommendedSkills: []` initial-state assignments (typically 3 locations).

  e) Remove the `normalizeRecommendedSkills` helper function.

  f) Remove the skill-toggle handler in the webview message dispatcher:
  ```typescript
  recommendedSkills: this.state.draft.recommendedSkills.map((skill) => skill.name === message.skillName
    ...
  ```

  g) Remove the `recommendedSkills: normalizeRecommendedSkills(generated.recommendedSkills)` line where the generated draft is loaded.

  h) Remove the skill-list rendering block:
  ```typescript
  if (!state.draft || state.draft.recommendedSkills.length === 0) {
  ...
  return '<div class="skill-list">' + state.draft.recommendedSkills.map((skill) => ...
  ```

  i) Remove `recommendedSkillsPath` from the output paths rendering (two locations near lines 1202 and 1325).

- [ ] **Step 4: Compile to confirm no remaining errors**

  ```bash
  npx tsc --noEmit
  ```
  Expected: PASS or only errors in test files (handled next).

---

## Task 4: Remove Feature 1 tests

**Files:**
- Modify: `test/prdWizardPersistence.test.ts`
- Modify: `test/commandShell.smoke.test.ts`
- Modify: `test/packageManifest.test.ts`
- Modify: `test/projectGenerator.test.ts`

- [ ] **Step 1: Prune `prdWizardPersistence.test.ts`**

  a) Remove any `recommended-skills.json` path assertions in test setup (`WritePaths` object construction — three references near lines 75, 91, 101).

  b) Delete the entire test:
  ```typescript
  test('writePrdWizardDraft rewrites recommended-skills.json to match an empty operator selection', async () => {
    ...
  });
  ```

- [ ] **Step 2: Prune `commandShell.smoke.test.ts`**

  Delete all three test blocks that invoke `ralphCodex.constructRecommendedSkills`:
  ```typescript
  await vscode.commands.executeCommand('ralphCodex.constructRecommendedSkills');
  ```
  (There are 3 separate tests; delete each one completely.)

- [ ] **Step 3: Prune `packageManifest.test.ts`**

  Find and delete the assertion line:
  ```typescript
  assert.ok(commands.includes('ralphCodex.constructRecommendedSkills'));
  ```

- [ ] **Step 4: Prune `projectGenerator.test.ts`**

  Remove any assertions that check `result.recommendedSkills` or the `recommendedSkills` field on the parsed output. (Search for `recommendedSkills` in this file.)

- [ ] **Step 5: Run validate**

  ```bash
  npm run validate
  ```
  Expected: PASS

- [ ] **Step 6: Commit**

  ```bash
  git add src/commands/registerCommands.ts src/ralph/projectGenerator.ts src/webview/prdCreationWizardHost.ts src/commands/prdWizardPersistence.ts test/prdWizardPersistence.test.ts test/commandShell.smoke.test.ts test/packageManifest.test.ts test/projectGenerator.test.ts package.json
  git commit -m "remove: Construct Recommended Skills command and related skill metadata plumbing"
  ```

---

## Task 5: Remove Feature 2 from `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove activation events**

  Find and delete these three lines from `activationEvents`:
  ```json
  "onCommand:ralphCodex.newProjectWizard",
  "onCommand:ralphCodex.newProject",
  "onCommand:ralphCodex.switchProject",
  ```

- [ ] **Step 2: Remove command contributions**

  Find and delete these three blocks from `contributes.commands`:
  ```json
  {
    "command": "ralphCodex.newProjectWizard",
    "title": "Ralphdex: New Project Wizard"
  },
  {
    "command": "ralphCodex.newProject",
    "title": "Ralphdex: New Project"
  },
  {
    "command": "ralphCodex.switchProject",
    "title": "Ralphdex: Switch Project"
  },
  ```

---

## Task 6: Remove Feature 2 helpers and command handlers from `registerCommands.ts`

**Files:**
- Modify: `src/commands/registerCommands.ts`

- [ ] **Step 1: Remove helper constants and functions**

  Find and delete the following six items (they appear as a cluster near line 282):

  ```typescript
  const RALPH_PROJECTS_DIR = 'projects';
  ```
  ```typescript
  function slugify(name: string): string { ... }
  ```
  ```typescript
  function projectAbsolutePaths(ralphDir: string, slug: string): { ... } { ... }
  ```
  ```typescript
  function projectRelativePaths(slug: string): { ... } { ... }
  ```
  ```typescript
  async function listExistingProjects(ralphDir: string): Promise<string[]> { ... }
  ```
  ```typescript
  async function switchToProject(...): Promise<void> { ... }
  ```

- [ ] **Step 2: Remove the `newProjectWizard` command**

  Delete the `registerCommand` block with `commandId: 'ralphCodex.newProjectWizard'`.

- [ ] **Step 3: Remove the `newProject` command**

  Delete the `registerCommand` block with `commandId: 'ralphCodex.newProject'`. This block also contains the second instance of recommended-skills write logic (`if (generated.recommendedSkills.length > 0) { ... }`) — delete that with the block.

- [ ] **Step 4: Remove the `switchProject` command**

  Delete the `registerCommand` block with `commandId: 'ralphCodex.switchProject'`.

- [ ] **Step 5: Compile**

  ```bash
  npx tsc --noEmit
  ```
  Expected: PASS or only errors in test files.

---

## Task 7: Remove Feature 2 tests

**Files:**
- Modify: `test/commandShell.smoke.test.ts`
- Modify: `test/packageManifest.test.ts`

- [ ] **Step 1: Prune `commandShell.smoke.test.ts`**

  Delete all test blocks that call these commands:
  - `ralphCodex.newProject` (2 tests)
  - `ralphCodex.newProjectWizard` (1 test)
  - `ralphCodex.switchProject` (1 test)

- [ ] **Step 2: Prune `packageManifest.test.ts`**

  Find and delete the test block:
  ```typescript
  test('package manifest contributes and activates the newProjectWizard command', async () => {
    ...
    manifest.activationEvents?.includes('onCommand:ralphCodex.newProjectWizard'),
    ...
    commands.some((entry) => entry.command === 'ralphCodex.newProjectWizard' ...),
    ...
  });
  ```

- [ ] **Step 3: Run validate**

  ```bash
  npm run validate
  ```
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  git add src/commands/registerCommands.ts test/commandShell.smoke.test.ts test/packageManifest.test.ts package.json
  git commit -m "remove: Named multi-project workspace management (newProject / switchProject)"
  ```

---

## Task 8: Remove Feature 3 command layer from `registerCommands.ts` and `package.json`

**Files:**
- Modify: `package.json`
- Modify: `src/commands/registerCommands.ts`

- [ ] **Step 1: Remove Feature 3 activation events from `package.json`**

  Delete these two lines from `activationEvents`:
  ```json
  "onCommand:ralphCodex.resumePipeline",
  "onCommand:ralphCodex.approveHumanReview",
  ```

- [ ] **Step 2: Remove Feature 3 command contributions from `package.json`**

  Delete these two blocks from `contributes.commands`:
  ```json
  {
    "command": "ralphCodex.resumePipeline",
    "title": "Ralphdex: Resume Pipeline"
  },
  {
    "command": "ralphCodex.approveHumanReview",
    "title": "Ralphdex: Approve Human Review"
  },
  ```

- [ ] **Step 3: Remove imports no longer needed in `registerCommands.ts`**

  a) From the pipeline import block, remove these three names:
  ```typescript
  findResumablePipelineArtifacts,
  writePipelinePendingHandoff,
  readPipelinePendingHandoff,
  resolvePendingHandoffPath
  ```
  (Keep all other pipeline imports.)

  b) Remove these two import lines:
  ```typescript
  import { clearHumanGateArtifact } from '../ralph/orchestrationSupervisor';
  import type { HumanGateType } from '../ralph/types';
  ```

- [ ] **Step 4: Remove `phaseToResumeFrom` helper**

  Delete the function:
  ```typescript
  function phaseToResumeFrom(phase: PipelinePhase | undefined): 'loop' | 'review' | 'scm' | null {
    switch (phase) {
      case 'scaffold': return 'loop';
      case 'loop': return 'review';
      case 'review': return 'scm';
      case 'scm': return 'scm';
      default: return null;
    }
  }
  ```

- [ ] **Step 5: Simplify `runPipelineFromPhase` — remove human-gate block**

  Inside `runPipelineFromPhase`, find and delete the `if (config.pipelineHumanGates)` block (lines ~650–665):
  ```typescript
  if (config.pipelineHumanGates) {
    const handoffPath = await writePipelinePendingHandoff(paths.handoffDir, {
      ...
    });
    await checkpoint({ status: 'awaiting_human_approval', loopEndTime: new Date().toISOString() });
    logger.info('Pipeline paused for human review.', { runId: current.runId, handoffPath });
    void vscode.window.showInformationMessage(
      `Ralph pipeline ${current.runId} paused for human review. Run "Ralphdex: Approve Human Review" to submit the PR.`
    );
    return;
  }
  ```
  After deletion `runScm = true;` should immediately follow the `checkpoint({ phase: 'review', ... })` call.

- [ ] **Step 6: Remove the `resumePipeline` command handler**

  Delete the entire `registerCommand` block with `commandId: 'ralphCodex.resumePipeline'` (~45 lines, lines 1619–1664).

- [ ] **Step 7: Remove the `approveHumanReview` command handler**

  Delete the entire `registerCommand` block with `commandId: 'ralphCodex.approveHumanReview'` (~100 lines, lines 1666–1769).

- [ ] **Step 8: Remove activation-time resume detection**

  Find and delete the block at the end of `registerCommands` (just before the closing `}`):
  ```typescript
  // On activation: scan for interrupted pipeline runs and offer to resume.
  const activationFolder = vscode.workspace.workspaceFolders?.[0];
  if (activationFolder) {
    const activationConfig = readConfig(activationFolder);
    const activationPaths = resolveRalphPaths(activationFolder.uri.fsPath, activationConfig);
    void (async () => {
      try {
        const resumable = await findResumablePipelineArtifacts(activationPaths.artifactDir);
        ...
      } catch (err) {
        logger.error('Failed to check for resumable pipelines on activation.', err);
      }
    })();
  }
  ```

- [ ] **Step 9: Compile**

  ```bash
  npx tsc --noEmit
  ```
  Expected: errors only in `pipeline.ts` exports and orchestrationSupervisor — handled in Task 9.

---

## Task 9: Remove Feature 3 infrastructure from `pipeline.ts`

**Files:**
- Modify: `src/ralph/pipeline.ts`

- [ ] **Step 1: Remove `awaiting_human_approval` from `PipelineRunStatus`**

  Find:
  ```typescript
  export type PipelineRunStatus = 'running' | 'complete' | 'failed' | 'awaiting_human_approval';
  ```
  Replace with:
  ```typescript
  export type PipelineRunStatus = 'running' | 'complete' | 'failed';
  ```

- [ ] **Step 2: Remove `PipelinePendingHandoff` interface**

  Delete the interface:
  ```typescript
  export interface PipelinePendingHandoff {
    schemaVersion: number;
    kind: 'pipelinePendingHandoff';
    runId: string;
    artifactPath: string;
    reviewTranscriptPath?: string;
    createdAt: string;
  }
  ```

- [ ] **Step 3: Remove handoff helpers**

  Delete these three functions:
  ```typescript
  export function resolvePendingHandoffPath(handoffDir: string, runId: string): string { ... }
  export async function writePipelinePendingHandoff(handoffDir: string, handoff: PipelinePendingHandoff): Promise<string> { ... }
  export async function readPipelinePendingHandoff(handoffPath: string): Promise<PipelinePendingHandoff> { ... }
  ```

- [ ] **Step 4: Remove `RESUMABLE_PHASES` and `findResumablePipelineArtifacts`**

  Delete:
  ```typescript
  const RESUMABLE_PHASES: ReadonlySet<PipelinePhase> = new Set([...]);
  ```
  And delete the function:
  ```typescript
  export async function findResumablePipelineArtifacts(artifactDir: string): Promise<Array<{ artifact: PipelineRunArtifact; artifactPath: string }>> { ... }
  ```

  **Do NOT delete `readLatestPipelineArtifact`** — it is used by `artifactCommands.ts` and `statusSnapshot.ts`.

- [ ] **Step 5: Compile**

  ```bash
  npx tsc --noEmit
  ```
  Expected: errors in orchestrationSupervisor imports — handled next.

---

## Task 10: Remove Feature 3 human-gate mechanism from `orchestrationSupervisor.ts`, `types.ts`, and config

**Files:**
- Modify: `src/ralph/orchestrationSupervisor.ts`
- Modify: `src/ralph/types.ts`
- Modify: `src/config/types.ts`
- Modify: `src/config/defaults.ts`
- Modify: `src/config/readConfig.ts`

- [ ] **Step 1: Remove `HumanGateType` and `HumanGateArtifact` from `types.ts`**

  Delete:
  ```typescript
  export type HumanGateType = 'scope_expansion' | 'dependency_rewiring' | 'contested_fan_in_scm';
  ```
  Delete:
  ```typescript
  export interface HumanGateArtifact {
    gateType: HumanGateType;
    ...
  }
  ```

- [ ] **Step 2: Remove imports and exports from `orchestrationSupervisor.ts`**

  a) Remove the two type imports at the top:
  ```typescript
  HumanGateArtifact,
  HumanGateType,
  ```

  b) Remove the re-exports:
  ```typescript
  export type { HumanGateType, HumanGateArtifact };
  ```

- [ ] **Step 3: Remove four human-gate functions from `orchestrationSupervisor.ts`**

  Delete each of:
  - `humanGateArtifactPath(artifactRootDir, parentTaskId, gateType)` function
  - `writeHumanGateArtifact(artifactRootDir, parentTaskId, artifact)` function
  - `clearHumanGateArtifact(artifactRootDir, parentTaskId, gateType)` function
  - `checkContestedFanInScmGate(input)` function

- [ ] **Step 4: Remove `pipelineHumanGates` from supervisor input types**

  Find the supervisor input/config type (around line 368) and remove:
  ```typescript
  pipelineHumanGates: boolean;
  ```
  Also remove the corresponding `pipelineHumanGates = false` default parameter in the function signature (around line 604).

- [ ] **Step 5: Remove all `pipelineHumanGates` conditional blocks from supervisor logic**

  There are three blocks that write gate artifacts conditionally on `pipelineHumanGates`. Delete each conditional block:

  **Block A** — scope expansion gate (around line 676):
  ```typescript
  if (pipelineHumanGates && addedTaskIds.length > maxGeneratedChildren / 2) {
    ...
    gateArtifactPath = await writeHumanGateArtifact(artifactRootDir, parentTaskId, gateArtifact);
    ...
    humanGateType: 'scope_expansion',
    humanGateArtifactPath: gateArtifactPath
  }
  ```

  **Block B** — dependency rewiring gate (around line 707):
  ```typescript
  if (pipelineHumanGates) {
    ...
    const gateArtifact: HumanGateArtifact = { gateType: 'dependency_rewiring', ... };
    ...
  }
  ```

  **Block C** — SCM gate (in `checkContestedFanInScmGate`, already deleted in Step 3).

- [ ] **Step 6: Remove `humanGate`-related output fields from supervisor return types**

  Find and remove these optional fields from result/output interfaces:
  ```typescript
  humanGateType?: HumanGateType;
  humanGateArtifactPath?: string | null;
  humanGateRequired: boolean;
  ```

- [ ] **Step 7: Remove `pipelineHumanGates` from config files**

  **`src/config/types.ts`** — delete:
  ```typescript
  pipelineHumanGates: boolean;
  ```

  **`src/config/defaults.ts`** — delete:
  ```typescript
  pipelineHumanGates: false,
  ```

  **`src/config/readConfig.ts`** — delete:
  ```typescript
  pipelineHumanGates: readBoolean(config, 'pipelineHumanGates', preset?.pipelineHumanGates ?? DEFAULT_CONFIG.pipelineHumanGates),
  ```

- [ ] **Step 8: Compile**

  ```bash
  npx tsc --noEmit
  ```
  Expected: PASS

---

## Task 11: Remove Feature 3 from `package.json` config contribution

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove the `pipelineHumanGates` setting**

  Find and delete the entire setting block in `contributes.configuration.properties`:
  ```json
  "ralphCodex.pipelineHumanGates": {
    "type": "boolean",
    ...
  },
  ```

- [ ] **Step 2: Scrub preset descriptions**

  Find the three preset description strings (in the `ralphCodex.preset` enum descriptions or similar). They each contain `pipelineHumanGates=true` or `pipelineHumanGates=false`. Remove only the `, pipelineHumanGates=true` / `, pipelineHumanGates=false` substring from each preset description string.

---

## Task 12: Remove Feature 3 tests

**Files:**
- Delete: `test/humanGates.test.ts`
- Modify: `test/pipeline.test.ts`
- Modify: `test/packageManifest.test.ts`
- Modify: `test/readConfig.test.ts`
- Modify: `test/docsValidator.test.ts`
- Modify: `test/commandShell.smoke.test.ts`

- [ ] **Step 1: Delete `humanGates.test.ts`**

  ```bash
  rm test/humanGates.test.ts
  ```

- [ ] **Step 2: Prune `pipeline.test.ts`**

  a) Remove these four imports at the top:
  ```typescript
  findResumablePipelineArtifacts,
  writePipelinePendingHandoff,
  readPipelinePendingHandoff,
  resolvePendingHandoffPath
  ```

  b) Delete all test blocks whose describe/test name contains `findResumablePipelineArtifacts`, `writePipelinePendingHandoff`, `readPipelinePendingHandoff`, or `resolvePendingHandoffPath`. There are approximately 6 test cases starting around line 300.

- [ ] **Step 3: Prune `packageManifest.test.ts`**

  Delete these test blocks:
  ```typescript
  test('package manifest exposes the pipelineHumanGates boolean setting', async () => { ... });
  test('package manifest contributes and activates the runPipeline command', async () => { ... });
  test('package manifest contributes and activates the approveHumanReview command', async () => { ... });
  ```

- [ ] **Step 4: Prune `readConfig.test.ts`**

  Find and delete:
  ```typescript
  assert.equal(config.pipelineHumanGates, true);
  ```
  (and any surrounding `pipelineHumanGates`-specific test context).

- [ ] **Step 5: Prune `docsValidator.test.ts`**

  Find and delete the two `'ralphCodex.pipelineHumanGates': { ... }` fixture entries (lines ~54 and ~886).

- [ ] **Step 6: Prune `commandShell.smoke.test.ts`**

  Find and delete the test block(s) that call `ralphCodex.runPipeline` and assert on human-gate behavior (search for `runPipeline must invoke the review phase through the review command` — approximately lines 2163–2174 and 2262).

- [ ] **Step 7: Run validate**

  ```bash
  npm run validate
  ```
  Expected: PASS

- [ ] **Step 8: Commit**

  ```bash
  git add src/commands/registerCommands.ts src/ralph/pipeline.ts src/ralph/orchestrationSupervisor.ts src/ralph/types.ts src/config/types.ts src/config/defaults.ts src/config/readConfig.ts test/humanGates.test.ts test/pipeline.test.ts test/packageManifest.test.ts test/readConfig.test.ts test/docsValidator.test.ts test/commandShell.smoke.test.ts package.json
  git commit -m "remove: Pipeline resume, human-gate checkpoint layer, and pipelineHumanGates config"
  ```

---

## Task 13: Update docs

**Files:**
- Modify: `docs/workflows.md`
- Modify: `README.md`

- [ ] **Step 1: Update `README.md`**

  Remove from the command listing:
  - `Ralphdex: Construct Recommended Skills`
  - `Ralphdex: New Project Wizard`
  - `Ralphdex: New Project`
  - `Ralphdex: Switch Project`
  - `Ralphdex: Resume Pipeline`
  - `Ralphdex: Approve Human Review`

- [ ] **Step 2: Update `docs/workflows.md`**

  Remove or condense:
  - Any section describing the "Construct Recommended Skills" workflow
  - Any section describing "New Project Wizard" / "Switch Project" / multi-project file layout
  - The pipeline resume section (describing `Resume Pipeline` command and `phaseToResumeFrom`)
  - The human-gate section (describing `pipelineHumanGates`, pending-handoff files, `Approve Human Review`)

  Keep all content about `Run Pipeline` itself (scaffold → loop → review → SCM → done is still valid).

- [ ] **Step 3: Run validate (docs-check included)**

  ```bash
  npm run validate
  ```
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  git add docs/workflows.md README.md
  git commit -m "docs: remove Recommended Skills, multi-project, and pipeline-resume references"
  ```

---

## Self-Review

**Spec coverage check:**
- Feature 1 (Construct Recommended Skills): Tasks 1–4 cover package.json, command handler, shared type plumbing, all tests.
- Feature 2 (Multi-project workspace): Tasks 5–7 cover package.json, six helpers, three command handlers, all tests.
- Feature 3 (Pipeline resume + human-gate): Tasks 8–12 cover command layer (resumePipeline, approveHumanReview, activation-time detection), pipeline.ts infrastructure (handoff + findResumable), orchestrationSupervisor human-gate mechanism, types, config, all tests. Task 11 covers package.json config property.
- Docs: Task 13.

**Placeholder scan:** None — every step names exactly what to search for and what to delete.

**Invariant check:**
- `readLatestPipelineArtifact` stays in `pipeline.ts` (used by `artifactCommands.ts` and `statusSnapshot.ts`).
- `runPipeline` command stays (only the human-gate block inside `runPipelineFromPhase` is pruned).
- `runPipelineFromPhase` stays (simplification only — human-gate conditional removed, rest unchanged).
- No changes to loop, review, SCM agent, multi-agent, provenance, or IDE handoff paths.

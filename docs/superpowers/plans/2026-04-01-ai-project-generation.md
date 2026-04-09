# AI-Driven PRD and Task Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user enters a project objective during `initializeWorkspace` or `newProject`, invoke the configured CLI provider to generate a full draft PRD and reasoned task list before opening the files.

**Architecture:** A new `projectGenerator.ts` module handles prompt construction, CLI invocation (via `runProcess` + the configured `CliProvider`), and response parsing. Both command handlers call `generateProjectDraft` with a progress message shown to the user, falling back to today's static behaviour on any failure. `createCliProvider` in `providerFactory.ts` is exported to avoid duplicating provider-construction logic.

**Tech Stack:** TypeScript, Node.js built-in `test`/`assert/strict`, `node:os`, existing `runProcess` / `setProcessRunnerOverride` / `CliProvider` abstractions.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/ralph/projectGenerator.ts` | `generateProjectDraft`, `parseGenerationResponse`, `ProjectGenerationError` |
| Create | `test/projectGenerator.test.ts` | Unit tests for parser and generator |
| Modify | `src/codex/providerFactory.ts` | Export `createCliProvider` |
| Modify | `src/commands/registerCommands.ts` | Wire generation into `initializeWorkspace` and `newProject`; add `readConfig` call; add `os` import |

---

## Task 1: Export `createCliProvider` from `providerFactory.ts`

**Files:**
- Modify: `src/codex/providerFactory.ts:12`

- [ ] **Step 1: Export the function**

In `src/codex/providerFactory.ts`, change line 12 from:

```ts
function createCliProvider(config: RalphCodexConfig): CliProvider {
```

to:

```ts
export function createCliProvider(config: RalphCodexConfig): CliProvider {
```

No other changes to this file.

- [ ] **Step 2: Verify compile passes**

```bash
cd ralph-codex-vscode-starter && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add ralph-codex-vscode-starter/src/codex/providerFactory.ts
git commit -m "feat: export createCliProvider for use in projectGenerator"
```

---

## Task 2: Write `parseGenerationResponse` — tests first

**Files:**
- Create: `test/projectGenerator.test.ts`
- Create: `src/ralph/projectGenerator.ts` (partial — parser only)

- [ ] **Step 1: Write the failing tests**

Create `test/projectGenerator.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGenerationResponse, ProjectGenerationError } from '../src/ralph/projectGenerator';

const VALID_RESPONSE = `# My Project

## Overview
This project does something useful.

## Goals
- Ship fast
- Stay reliable

## Phase 1: Foundation
Build the core data model.

## Phase 2: API
Expose a REST interface.

\`\`\`json
[
  { "id": "T1", "title": "Build core data model", "status": "todo" },
  { "id": "T2", "title": "Expose REST interface", "status": "todo" }
]
\`\`\``;

test('parseGenerationResponse extracts prdText before the JSON fence', () => {
  const { prdText } = parseGenerationResponse(VALID_RESPONSE);
  assert.ok(prdText.startsWith('# My Project'));
  assert.ok(!prdText.includes('```json'));
  assert.ok(!prdText.includes('T1'));
});

test('parseGenerationResponse returns correct task array', () => {
  const { tasks } = parseGenerationResponse(VALID_RESPONSE);
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks[0], { id: 'T1', title: 'Build core data model', status: 'todo' });
  assert.deepEqual(tasks[1], { id: 'T2', title: 'Expose REST interface', status: 'todo' });
});

test('parseGenerationResponse forces status to "todo" regardless of what AI returns', () => {
  const response = `# P\n\`\`\`json\n[{ "id": "T1", "title": "x", "status": "in_progress" }]\n\`\`\``;
  const { tasks } = parseGenerationResponse(response);
  assert.equal(tasks[0].status, 'todo');
});

test('parseGenerationResponse uses the LAST json fence when multiple are present', () => {
  const response = `# P\n\`\`\`json\n[{ "id": "TX", "title": "wrong", "status": "todo" }]\n\`\`\`\nMore text.\n\`\`\`json\n[{ "id": "T1", "title": "right", "status": "todo" }]\n\`\`\``;
  const { tasks } = parseGenerationResponse(response);
  assert.equal(tasks[0].id, 'T1');
});

test('parseGenerationResponse throws ProjectGenerationError when no JSON fence', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n\nNo fence here.'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /fenced JSON block/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when JSON is malformed', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\nnot valid json\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /malformed JSON/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when JSON is an empty array', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\n[]\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /non-empty array/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when task missing id', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\n[{ "title": "x", "status": "todo" }]\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /"id"/);
      return true;
    }
  );
});

test('parseGenerationResponse throws ProjectGenerationError when task missing title', () => {
  assert.throws(
    () => parseGenerationResponse('# P\n```json\n[{ "id": "T1", "status": "todo" }]\n```'),
    (err: unknown) => {
      assert.ok(err instanceof ProjectGenerationError);
      assert.match(err.message, /"title"/);
      return true;
    }
  );
});
```

- [ ] **Step 2: Create the stub `projectGenerator.ts` with parser only**

Create `src/ralph/projectGenerator.ts`:

```ts
import * as os from 'os';
import * as path from 'path';
import { RalphCodexConfig } from '../config/types';
import { RalphTask } from './types';
import { createCliProvider } from '../codex/providerFactory';
import { runProcess } from '../services/processRunner';

export class ProjectGenerationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ProjectGenerationError';
  }
}

export function parseGenerationResponse(responseText: string): {
  prdText: string;
  tasks: Pick<RalphTask, 'id' | 'title' | 'status'>[];
} {
  const fencePattern = /```json\s*([\s\S]*?)```/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(responseText)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    throw new ProjectGenerationError('AI response did not contain a fenced JSON block.');
  }

  const prdText = responseText.slice(0, lastMatch.index).trim();
  const jsonText = lastMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new ProjectGenerationError(`AI response contained a malformed JSON block: ${jsonText.slice(0, 100)}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new ProjectGenerationError('AI response JSON block must be a non-empty array of tasks.');
  }

  const tasks = (parsed as unknown[]).map((item, i) => {
    if (
      typeof item !== 'object' || item === null ||
      typeof (item as Record<string, unknown>).id !== 'string' ||
      typeof (item as Record<string, unknown>).title !== 'string'
    ) {
      throw new ProjectGenerationError(
        `Task at index ${i} is missing required "id" or "title" field.`
      );
    }
    return {
      id: String((item as Record<string, unknown>).id),
      title: String((item as Record<string, unknown>).title),
      status: 'todo' as const
    };
  });

  return { prdText, tasks };
}

export async function generateProjectDraft(
  _objective: string,
  _config: RalphCodexConfig,
  _cwd: string
): Promise<{ prdText: string; tasks: Pick<RalphTask, 'id' | 'title' | 'status'>[] }> {
  throw new Error('not implemented');
}
```

- [ ] **Step 3: Run the parser tests to verify they pass**

```bash
cd ralph-codex-vscode-starter && npm run test 2>&1 | grep -E "projectGenerator|pass|fail|error" | head -30
```

Expected: all `projectGenerator` tests pass, no failures.

- [ ] **Step 4: Commit**

```bash
git add ralph-codex-vscode-starter/src/ralph/projectGenerator.ts ralph-codex-vscode-starter/test/projectGenerator.test.ts
git commit -m "feat: add parseGenerationResponse with full test coverage"
```

---

## Task 3: Implement `generateProjectDraft` — tests first

**Files:**
- Modify: `test/projectGenerator.test.ts` (append tests)
- Modify: `src/ralph/projectGenerator.ts` (implement the function)

- [ ] **Step 1: Append `generateProjectDraft` tests to `test/projectGenerator.test.ts`**

Add after the existing tests:

```ts
import { generateProjectDraft } from '../src/ralph/projectGenerator';
import { setProcessRunnerOverride } from '../src/services/processRunner';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import * as os from 'node:os';

const VALID_CLAUDE_STDOUT = JSON.stringify({
  type: 'result',
  result: `# Draft Project\n\n## Overview\nOverview text.\n\n## Phase 1\nDo the first thing.\n\n\`\`\`json\n[{ "id": "T1", "title": "Phase 1 work", "status": "todo" }]\n\`\`\``,
  num_turns: 1
});

test('generateProjectDraft returns prdText and tasks on success (claude provider)', async () => {
  setProcessRunnerOverride((_cmd, _args, _opts) => ({
    code: 0,
    stdout: VALID_CLAUDE_STDOUT,
    stderr: ''
  }));

  try {
    const result = await generateProjectDraft(
      'Build a task manager',
      { ...DEFAULT_CONFIG, cliProvider: 'claude' },
      os.tmpdir()
    );
    assert.ok(result.prdText.startsWith('# Draft Project'));
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].id, 'T1');
    assert.equal(result.tasks[0].status, 'todo');
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('generateProjectDraft throws ProjectGenerationError when CLI exits non-zero', async () => {
  setProcessRunnerOverride((_cmd, _args, _opts) => ({
    code: 1,
    stdout: '',
    stderr: 'error: something went wrong'
  }));

  try {
    await assert.rejects(
      () => generateProjectDraft('Build something', { ...DEFAULT_CONFIG, cliProvider: 'claude' }, os.tmpdir()),
      (err: unknown) => {
        assert.ok(err instanceof ProjectGenerationError);
        assert.match(err.message, /exited with code 1/);
        return true;
      }
    );
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('generateProjectDraft throws ProjectGenerationError when response has no JSON fence', async () => {
  const stdoutNoFence = JSON.stringify({
    type: 'result',
    result: '# P\n\nNo fence.',
    num_turns: 1
  });

  setProcessRunnerOverride((_cmd, _args, _opts) => ({
    code: 0,
    stdout: stdoutNoFence,
    stderr: ''
  }));

  try {
    await assert.rejects(
      () => generateProjectDraft('Build something', { ...DEFAULT_CONFIG, cliProvider: 'claude' }, os.tmpdir()),
      (err: unknown) => {
        assert.ok(err instanceof ProjectGenerationError);
        return true;
      }
    );
  } finally {
    setProcessRunnerOverride(null);
  }
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd ralph-codex-vscode-starter && npm run test 2>&1 | grep -E "generateProjectDraft|not implemented" | head -20
```

Expected: tests fail with "not implemented".

- [ ] **Step 3: Implement `generateProjectDraft`**

Replace the stub `generateProjectDraft` in `src/ralph/projectGenerator.ts` with:

```ts
const GENERATION_PROMPT_TEMPLATE = `You are helping set up a new software project for an agentic coding loop.

The user's objective is:

<objective>
{OBJECTIVE}
</objective>

Write a Product Requirements Document (PRD) in markdown for this project. Then, at the very end of your response, output a fenced JSON block containing an array of tasks.

Requirements:
- Start with a # heading for the project title
- Include: ## Overview, ## Goals, then one ## section per major work area (aim for 3-7 sections)
- Keep each section to 2-4 sentences
- Tasks must correspond one-to-one with the ## work area sections
- End your response with EXACTLY this structure (no text after the closing fence):

\`\`\`json
[
  { "id": "T1", "title": "short task title", "status": "todo" },
  { "id": "T2", "title": "short task title", "status": "todo" }
]
\`\`\`

Respond ONLY with the PRD markdown followed by the JSON fence. No preamble, no explanation after the fence.`;

function commandPathForConfig(config: RalphCodexConfig): string {
  if (config.cliProvider === 'claude') { return config.claudeCommandPath; }
  if (config.cliProvider === 'copilot') { return config.copilotCommandPath; }
  return config.codexCommandPath;
}

export async function generateProjectDraft(
  objective: string,
  config: RalphCodexConfig,
  cwd: string
): Promise<{ prdText: string; tasks: Pick<RalphTask, 'id' | 'title' | 'status'>[] }> {
  const provider = createCliProvider(config);
  const prompt = GENERATION_PROMPT_TEMPLATE.replace('{OBJECTIVE}', objective);
  const lastMessagePath = path.join(os.tmpdir(), `ralph-gen-${Date.now()}.last-message.txt`);

  const launchSpec = provider.buildLaunchSpec({
    commandPath: commandPathForConfig(config),
    workspaceRoot: cwd,
    executionRoot: cwd,
    prompt,
    promptPath: '',
    promptHash: '',
    promptByteLength: Buffer.byteLength(prompt, 'utf8'),
    transcriptPath: '',
    lastMessagePath,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    sandboxMode: config.sandboxMode,
    approvalMode: config.approvalMode
  }, true);

  const result = await runProcess(commandPathForConfig(config), launchSpec.args, {
    cwd: launchSpec.cwd,
    stdinText: launchSpec.stdinText
  });

  if (result.code !== 0) {
    throw new ProjectGenerationError(`CLI exited with code ${result.code}.`);
  }

  const responseText = await provider.extractResponseText(result.stdout, result.stderr, lastMessagePath);
  return parseGenerationResponse(responseText);
}
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
cd ralph-codex-vscode-starter && npm run test 2>&1 | tail -20
```

Expected: all tests pass including the new `generateProjectDraft` tests.

- [ ] **Step 5: Commit**

```bash
git add ralph-codex-vscode-starter/src/ralph/projectGenerator.ts ralph-codex-vscode-starter/test/projectGenerator.test.ts
git commit -m "feat: implement generateProjectDraft with CLI invocation and response parsing"
```

---

## Task 4: Wire generation into `initializeWorkspace`

**Files:**
- Modify: `src/commands/registerCommands.ts`

The `initializeWorkspace` handler currently (around line 301):
1. Calls `withWorkspaceFolder()`
2. Checks if `prd.md` exists
3. Calls `initializeFreshWorkspace()`
4. Prompts for objective via `showInputBox`
5. Writes raw objective to `prd.md`
6. Calls `draftTasksFromPrd(prdText)` for tasks
7. Opens both files

We update steps 5–6 to call `generateProjectDraft` with fallback.

- [ ] **Step 1: Add missing imports at the top of `registerCommands.ts`**

Add after the existing imports (near line 1):

```ts
import * as os from 'os';
import { generateProjectDraft, ProjectGenerationError } from '../ralph/projectGenerator';
```

Also add `readConfig` to the existing config import if not already present — it is already imported on line 4:
```ts
import { readConfig } from '../config/readConfig';
```
No change needed there.

- [ ] **Step 2: Update the `initializeWorkspace` handler body**

Locate the handler body starting around line 303. Replace the block from `// Step 1: Seed the PRD` through `logger.info('Generated ${drafts.length} starter task(s) from PRD.');` with:

```ts
      // Read config so we know which CLI provider to use for generation
      const config = readConfig(workspaceFolder);

      // Step 1: Prompt for objective
      const objective = await vscode.window.showInputBox({
        prompt: 'Enter a short project objective (press Escape to fill in prd.md manually)',
        placeHolder: 'Example: Build a reliable v2 iteration engine for the VS Code extension',
        ignoreFocusOut: true
      });

      let prdText: string;
      let drafts: Pick<RalphTask, 'id' | 'title' | 'status'>[];

      if (objective?.trim()) {
        progress.report({ message: 'Generating PRD and tasks — this may take a moment…' });
        try {
          const generated = await generateProjectDraft(objective.trim(), config, workspaceFolder.uri.fsPath);
          prdText = generated.prdText;
          drafts = generated.tasks;
          logger.info('Generated PRD and tasks via AI.', { taskCount: drafts.length });
        } catch (err) {
          const reason = err instanceof ProjectGenerationError || err instanceof Error
            ? err.message
            : String(err);
          logger.info(`AI generation failed, falling back to template. Reason: ${reason}`);
          void vscode.window.showWarningMessage(
            `AI generation failed — files seeded with a starter template. Refine before running. (${reason})`
          );
          prdText = `# Product / project brief\n\n${objective.trim()}\n`;
          drafts = draftTasksFromPrd(prdText);
        }
      } else {
        prdText = RALPH_PRD_PLACEHOLDER;
        drafts = draftTasksFromPrd(prdText);
      }

      await fs.writeFile(result.prdPath, prdText, 'utf8');
      logger.info('Wrote prd.md.');
```

Then keep the existing `appendTasksToFile(result.tasksPath, drafts)` call and everything after it unchanged.

- [ ] **Step 3: Run validate**

```bash
cd ralph-codex-vscode-starter && npm run validate
```

Expected: all checks pass.

- [ ] **Step 4: Commit**

```bash
git add ralph-codex-vscode-starter/src/commands/registerCommands.ts
git commit -m "feat: generate PRD and tasks via AI in initializeWorkspace"
```

---

## Task 5: Wire generation into `newProject`

**Files:**
- Modify: `src/commands/registerCommands.ts`

The `newProject` handler (around line 407) similarly takes an objective, writes it as a two-line PRD, and calls `draftTasksFromPrd`. We apply the same pattern.

- [ ] **Step 1: Update the `newProject` handler body**

Locate the section around line 450 in the `newProject` handler. The current code after the `objective` input box is:

```ts
      progress.report({ message: `Creating project "${slug}"` });
      await fs.mkdir(absPaths.dir, { recursive: true });

      const prdText = objective?.trim()
        ? `# Product / project brief\n\n${objective.trim()}\n`
        : RALPH_PRD_PLACEHOLDER;

      await fs.writeFile(absPaths.prdPath, prdText, 'utf8');

      const emptyLocked = await withTaskFileLock(absPaths.tasksPath, undefined, async () => {
        await fs.writeFile(absPaths.tasksPath, `${JSON.stringify({ version: 2, tasks: [] }, null, 2)}\n`, 'utf8');
      });
      if (emptyLocked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring lock for "${slug}" tasks.json.`);
      }

      await appendTasksToFile(absPaths.tasksPath, draftTasksFromPrd(prdText));
```

Replace it with:

```ts
      progress.report({ message: `Creating project "${slug}"` });
      await fs.mkdir(absPaths.dir, { recursive: true });

      const config = readConfig(workspaceFolder);

      let prdText: string;
      let drafts: Pick<RalphTask, 'id' | 'title' | 'status'>[];

      if (objective?.trim()) {
        progress.report({ message: 'Generating PRD and tasks — this may take a moment…' });
        try {
          const generated = await generateProjectDraft(objective.trim(), config, workspaceFolder.uri.fsPath);
          prdText = generated.prdText;
          drafts = generated.tasks;
          logger.info(`Generated PRD and tasks for project "${slug}" via AI.`, { taskCount: drafts.length });
        } catch (err) {
          const reason = err instanceof ProjectGenerationError || err instanceof Error
            ? err.message
            : String(err);
          logger.info(`AI generation failed for "${slug}", falling back to template. Reason: ${reason}`);
          void vscode.window.showWarningMessage(
            `AI generation failed — files seeded with a starter template. Refine before running. (${reason})`
          );
          prdText = `# Product / project brief\n\n${objective.trim()}\n`;
          drafts = draftTasksFromPrd(prdText);
        }
      } else {
        prdText = RALPH_PRD_PLACEHOLDER;
        drafts = draftTasksFromPrd(prdText);
      }

      await fs.writeFile(absPaths.prdPath, prdText, 'utf8');

      const emptyLocked = await withTaskFileLock(absPaths.tasksPath, undefined, async () => {
        await fs.writeFile(absPaths.tasksPath, `${JSON.stringify({ version: 2, tasks: [] }, null, 2)}\n`, 'utf8');
      });
      if (emptyLocked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring lock for "${slug}" tasks.json.`);
      }

      await appendTasksToFile(absPaths.tasksPath, drafts);
```

- [ ] **Step 2: Run validate**

```bash
cd ralph-codex-vscode-starter && npm run validate
```

Expected: all checks pass.

- [ ] **Step 3: Commit**

```bash
git add ralph-codex-vscode-starter/src/commands/registerCommands.ts
git commit -m "feat: generate PRD and tasks via AI in newProject"
```

---

## Self-Review

**Spec coverage:**
- ✅ AI reasoning invoked on objective entry (Tasks 3, 4, 5)
- ✅ Full draft PRD produced before file is opened (Tasks 4, 5)
- ✅ Reasoned tasks.json produced (Tasks 4, 5)
- ✅ User notified via `progress.report` while generation runs (Tasks 4, 5)
- ✅ Uses configured CLI provider (Task 3 — `createCliProvider(config)`)
- ✅ Claude CLI accepted for claude provider (Task 3 — same code path)
- ✅ Fallback to template on any failure (Tasks 4, 5 — catch block)
- ✅ Warning message shown on fallback (Tasks 4, 5)
- ✅ Tests via `setProcessRunnerOverride` (Task 3)
- ✅ Parser unit tested exhaustively (Task 2)

**Type consistency:**
- `generateProjectDraft` returns `Pick<RalphTask, 'id' | 'title' | 'status'>[]` — matches `appendTasksToFile` parameter type throughout.
- `drafts` variable in both handlers typed as `Pick<RalphTask, 'id' | 'title' | 'status'>[]` — same type `draftTasksFromPrd` already returns, so fallback path is type-safe.
- `createCliProvider` exported in Task 1, imported in Task 3 (`projectGenerator.ts`) — consistent name.
- `ProjectGenerationError` exported in Task 2, imported in Tasks 4 and 5 — consistent.
- `commandPathForConfig` helper defined in Task 3 and used only within `projectGenerator.ts` — no cross-task name drift.

**Placeholder scan:** No TBDs, no "similar to Task N", all code blocks are complete.

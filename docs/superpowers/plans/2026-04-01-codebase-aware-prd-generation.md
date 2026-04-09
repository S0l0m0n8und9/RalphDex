# Codebase-Aware PRD Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pass a WorkspaceScan summary + shallow file tree into the PRD generation prompt so the AI understands what already exists in the repo before writing the PRD and tasks.

**Architecture:** Add an optional `codebaseContext?: string` parameter to `generateProjectDraft()`. A new `codebaseSnapshot.ts` module builds the context string (WorkspaceScan metadata + depth-2 file tree) from the workspace root. Both `initializeWorkspace` and `newProject` call it and pass the result through.

**Tech Stack:** TypeScript, Node.js `fs` (sync readdir), existing `scanWorkspaceCached` from `workspaceScanner.ts`, `node:test` + `node:assert` for tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/ralph/projectGenerator.ts` | Export `buildGenerationPrompt`; accept `codebaseContext?` in `generateProjectDraft` |
| Create | `src/commands/codebaseSnapshot.ts` | `buildFileTree`, `formatScanMetadata`, `buildCodebaseSnapshot` |
| Modify | `src/commands/registerCommands.ts` | Import + call `buildCodebaseSnapshot`; pass result to `generateProjectDraft` |
| Modify | `test/projectGenerator.test.ts` | Tests for `buildGenerationPrompt` with/without context |
| Create | `test/codebaseSnapshot.test.ts` | Tests for `buildFileTree` and `formatScanMetadata` |

---

### Task 1: Write failing tests for `buildGenerationPrompt`

**Files:**
- Modify: `test/projectGenerator.test.ts`

- [ ] **Step 1: Add the failing tests at the bottom of `test/projectGenerator.test.ts`**

Append after line 251:

```typescript
import { buildGenerationPrompt } from '../src/ralph/projectGenerator';

test('buildGenerationPrompt includes <codebase> block when codebaseContext is provided', () => {
  const ctx = 'Package manager: npm\n\nFile tree:\nsrc/\n  index.ts';
  const prompt = buildGenerationPrompt('Build a thing', ctx);
  assert.ok(prompt.includes('<codebase>'), 'should contain opening <codebase> tag');
  assert.ok(prompt.includes('</codebase>'), 'should contain closing </codebase> tag');
  assert.ok(prompt.includes('Package manager: npm'), 'should contain context content');
  assert.ok(prompt.includes('<objective>'), 'should still contain objective block');
  assert.ok(prompt.includes('Build a thing'), 'should still contain the objective text');
});

test('buildGenerationPrompt omits <codebase> block when codebaseContext is undefined', () => {
  const prompt = buildGenerationPrompt('Build a thing');
  assert.ok(!prompt.includes('<codebase>'), 'should not contain <codebase> tag');
  assert.ok(prompt.includes('<objective>'), 'should still contain objective block');
});

test('buildGenerationPrompt omits <codebase> block when codebaseContext is empty string', () => {
  const prompt = buildGenerationPrompt('Build a thing', '');
  assert.ok(!prompt.includes('<codebase>'), 'should not contain <codebase> tag');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ralph-codex-vscode-starter && node --test test/projectGenerator.test.ts 2>&1 | tail -20
```

Expected: `SyntaxError` or `Error: 'buildGenerationPrompt' is not exported` — the export doesn't exist yet.

---

### Task 2: Implement `buildGenerationPrompt` and update `generateProjectDraft`

**Files:**
- Modify: `src/ralph/projectGenerator.ts`

- [ ] **Step 1: Export `buildGenerationPrompt` and update `generateProjectDraft`**

Replace the `GENERATION_PROMPT_TEMPLATE` constant and the first part of `generateProjectDraft` in `src/ralph/projectGenerator.ts`.

**Replace** `GENERATION_PROMPT_TEMPLATE` (lines 67–91) and `generateProjectDraft` (lines 99–137) with:

```typescript
const OBJECTIVE_PROMPT_TEMPLATE = `You are helping set up a new software project for an agentic coding loop.

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

const CODEBASE_FRAMING = `Use the codebase context above to understand what already exists before interpreting the objective. If the objective mentions a technology or structure that does not appear in the file tree, treat this as introducing it from scratch rather than modifying existing code.`;

export function buildGenerationPrompt(objective: string, codebaseContext?: string): string {
  const safeObjective = objective.replace(/<\/objective>/gi, '[/objective]');
  const body = OBJECTIVE_PROMPT_TEMPLATE.replace('{OBJECTIVE}', safeObjective);
  if (!codebaseContext?.trim()) {
    return body;
  }
  return `<codebase>\n${codebaseContext}\n</codebase>\n\n${CODEBASE_FRAMING}\n\n${body}`;
}

export async function generateProjectDraft(
  objective: string,
  config: RalphCodexConfig,
  cwd: string,
  codebaseContext?: string
): Promise<{ prdText: string; tasks: Pick<RalphTask, 'id' | 'title' | 'status'>[] }> {
  const commandPath = commandPathForConfig(config);
  const provider = createCliProvider(config);
  const prompt = buildGenerationPrompt(objective, codebaseContext);
  const lastMessagePath = path.join(os.tmpdir(), `ralph-gen-${Date.now()}.last-message.txt`);

  const launchSpec = provider.buildLaunchSpec({
    commandPath,
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

  const result = await runProcess(commandPath, launchSpec.args, {
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

- [ ] **Step 2: Run the new tests to confirm they pass**

```bash
cd ralph-codex-vscode-starter && node --test test/projectGenerator.test.ts 2>&1 | tail -20
```

Expected: all tests pass, including the 3 new `buildGenerationPrompt` tests.

- [ ] **Step 3: Run full validation to confirm nothing is broken**

```bash
cd ralph-codex-vscode-starter && npm run validate 2>&1 | tail -30
```

Expected: compile, docs check, lint, and tests all pass.

- [ ] **Step 4: Commit**

```bash
cd ralph-codex-vscode-starter && git add src/ralph/projectGenerator.ts test/projectGenerator.test.ts && git commit -m "feat: export buildGenerationPrompt and accept codebaseContext in generateProjectDraft"
```

---

### Task 3: Write failing tests for `buildFileTree` and `formatScanMetadata`

**Files:**
- Create: `test/codebaseSnapshot.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';
import { buildFileTree, formatScanMetadata } from '../src/commands/codebaseSnapshot';
import type { WorkspaceScan } from '../src/services/workspaceInspection';

// ---------------------------------------------------------------------------
// buildFileTree
// ---------------------------------------------------------------------------

test('buildFileTree lists files and directories at depth 2', () => {
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'ralph-snapshot-test-'));
  try {
    nodeFs.mkdirSync(nodePath.join(dir, 'src'));
    nodeFs.writeFileSync(nodePath.join(dir, 'src', 'index.ts'), '');
    nodeFs.writeFileSync(nodePath.join(dir, 'package.json'), '{}');
    const tree = buildFileTree(dir);
    assert.ok(tree.includes('src/'), `expected 'src/' in tree:\n${tree}`);
    assert.ok(tree.includes('index.ts'), `expected 'index.ts' in tree:\n${tree}`);
    assert.ok(tree.includes('package.json'), `expected 'package.json' in tree:\n${tree}`);
  } finally {
    nodeFs.rmSync(dir, { recursive: true, force: true });
  }
});

test('buildFileTree excludes node_modules, .git, .ralph, dist, out, coverage', () => {
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'ralph-snapshot-test-'));
  try {
    for (const ignored of ['node_modules', '.git', '.ralph', 'dist', 'out', 'coverage']) {
      nodeFs.mkdirSync(nodePath.join(dir, ignored));
      nodeFs.writeFileSync(nodePath.join(dir, ignored, 'file.txt'), '');
    }
    nodeFs.writeFileSync(nodePath.join(dir, 'visible.ts'), '');
    const tree = buildFileTree(dir);
    assert.ok(tree.includes('visible.ts'), `expected visible.ts in tree:\n${tree}`);
    for (const ignored of ['node_modules', '.git', '.ralph', 'dist', 'out', 'coverage']) {
      assert.ok(!tree.includes(ignored), `'${ignored}' should be excluded:\n${tree}`);
    }
  } finally {
    nodeFs.rmSync(dir, { recursive: true, force: true });
  }
});

test('buildFileTree does not descend beyond depth 2', () => {
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'ralph-snapshot-test-'));
  try {
    nodeFs.mkdirSync(nodePath.join(dir, 'a', 'b', 'c'), { recursive: true });
    nodeFs.writeFileSync(nodePath.join(dir, 'a', 'b', 'c', 'deep.ts'), '');
    const tree = buildFileTree(dir, 2);
    assert.ok(!tree.includes('deep.ts'), `deep.ts at depth 3 should be excluded:\n${tree}`);
    assert.ok(tree.includes('b/'), `b/ at depth 2 should be listed:\n${tree}`);
  } finally {
    nodeFs.rmSync(dir, { recursive: true, force: true });
  }
});

test('buildFileTree returns empty string for a non-existent directory', () => {
  const tree = buildFileTree('/does/not/exist/ralph-test-12345');
  assert.equal(tree, '');
});

// ---------------------------------------------------------------------------
// formatScanMetadata
// ---------------------------------------------------------------------------

const BASE_SCAN: WorkspaceScan = {
  workspaceName: 'my-app',
  workspaceRootPath: '/workspace',
  rootPath: '/workspace',
  rootSelection: {} as any,
  manifests: ['/workspace/package.json', '/workspace/tsconfig.json'],
  projectMarkers: [],
  packageManagers: ['npm'],
  packageManagerIndicators: [],
  ciFiles: [],
  ciCommands: [],
  docs: [],
  sourceRoots: ['src'],
  tests: ['test'],
  lifecycleCommands: [],
  validationCommands: ['npm run validate'],
  testSignals: [],
  notes: [],
  evidence: {} as any,
  packageJson: null
};

test('formatScanMetadata includes package manager, source roots, manifests, and validation', () => {
  const result = formatScanMetadata(BASE_SCAN);
  assert.ok(result.includes('npm'), `expected 'npm' in result:\n${result}`);
  assert.ok(result.includes('src'), `expected 'src' in result:\n${result}`);
  assert.ok(result.includes('package.json'), `expected 'package.json' in result:\n${result}`);
  assert.ok(result.includes('npm run validate'), `expected 'npm run validate' in result:\n${result}`);
});

test('formatScanMetadata uses basename of manifest paths, not full paths', () => {
  const result = formatScanMetadata(BASE_SCAN);
  assert.ok(!result.includes('/workspace/'), `should not include full paths:\n${result}`);
});

test('formatScanMetadata returns empty string when all relevant fields are empty', () => {
  const empty: WorkspaceScan = {
    ...BASE_SCAN,
    packageManagers: [],
    sourceRoots: [],
    manifests: [],
    validationCommands: []
  };
  assert.equal(formatScanMetadata(empty), '');
});

test('formatScanMetadata omits lines for empty fields', () => {
  const partial: WorkspaceScan = { ...BASE_SCAN, sourceRoots: [], validationCommands: [] };
  const result = formatScanMetadata(partial);
  assert.ok(result.includes('npm'), 'should include package manager');
  assert.ok(!result.includes('Source roots'), 'should omit source roots line');
  assert.ok(!result.includes('Validation'), 'should omit validation line');
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd ralph-codex-vscode-starter && node --test test/codebaseSnapshot.test.ts 2>&1 | tail -20
```

Expected: `Error: Cannot find module '../src/commands/codebaseSnapshot'`

---

### Task 4: Create `src/commands/codebaseSnapshot.ts`

**Files:**
- Create: `src/commands/codebaseSnapshot.ts`

- [ ] **Step 1: Create the file**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { scanWorkspaceCached } from '../services/workspaceScanner';
import type { WorkspaceScan } from '../services/workspaceInspection';

const IGNORE_NAMES = new Set([
  '.git', 'node_modules', '.ralph', '.vscode', '.codex',
  'dist', 'out', 'coverage'
]);

export function buildFileTree(dir: string, depth = 2, prefix = ''): string {
  if (depth === 0) { return ''; }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return '';
  }
  const lines: string[] = [];
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of sorted) {
    if (IGNORE_NAMES.has(entry.name) || entry.name.endsWith('.vsix')) { continue; }
    if (entry.isDirectory()) {
      lines.push(`${prefix}${entry.name}/`);
      const subtree = buildFileTree(path.join(dir, entry.name), depth - 1, `${prefix}  `);
      if (subtree) { lines.push(subtree); }
    } else {
      lines.push(`${prefix}${entry.name}`);
    }
  }
  return lines.join('\n');
}

export function formatScanMetadata(scan: WorkspaceScan): string {
  const lines: string[] = [];
  if (scan.packageManagers.length > 0) {
    lines.push(`Package manager: ${scan.packageManagers.join(', ')}`);
  }
  if (scan.sourceRoots.length > 0) {
    lines.push(`Source roots: ${scan.sourceRoots.join(', ')}`);
  }
  if (scan.manifests.length > 0) {
    lines.push(`Manifests: ${scan.manifests.map(m => path.basename(m)).join(', ')}`);
  }
  if (scan.validationCommands.length > 0) {
    lines.push(`Validation: ${scan.validationCommands.join(', ')}`);
  }
  return lines.join('\n');
}

export async function buildCodebaseSnapshot(cwd: string): Promise<string> {
  try {
    const scan = await scanWorkspaceCached(cwd);
    const metadata = formatScanMetadata(scan);
    const tree = buildFileTree(cwd);
    const parts: string[] = [];
    if (metadata) { parts.push(metadata); }
    if (tree) { parts.push(`\nFile tree:\n${tree}`); }
    return parts.join('\n');
  } catch {
    return '';
  }
}
```

- [ ] **Step 2: Run the codebaseSnapshot tests to confirm they pass**

```bash
cd ralph-codex-vscode-starter && node --test test/codebaseSnapshot.test.ts 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 3: Run full validation**

```bash
cd ralph-codex-vscode-starter && npm run validate 2>&1 | tail -30
```

Expected: compile, docs check, lint, tests all pass.

- [ ] **Step 4: Commit**

```bash
cd ralph-codex-vscode-starter && git add src/commands/codebaseSnapshot.ts test/codebaseSnapshot.test.ts && git commit -m "feat: add codebaseSnapshot module with buildFileTree and formatScanMetadata"
```

---

### Task 5: Wire `buildCodebaseSnapshot` into both command handlers

**Files:**
- Modify: `src/commands/registerCommands.ts`

- [ ] **Step 1: Add the import at the top of `registerCommands.ts`**

After the existing imports block (after line 44 where `generateProjectDraft` is imported), add:

```typescript
import { buildCodebaseSnapshot } from './codebaseSnapshot';
```

- [ ] **Step 2: Update the `initializeWorkspace` call site**

Find this block (around line 483–486 in `registerCommands.ts`):

```typescript
      if (objective?.trim()) {
        progress.report({ message: 'Generating PRD and tasks — this may take a moment…' });
        try {
          const generated = await generateProjectDraft(objective.trim(), config, workspaceFolder.uri.fsPath);
```

Replace the `generateProjectDraft` call with:

```typescript
      if (objective?.trim()) {
        progress.report({ message: 'Generating PRD and tasks — this may take a moment…' });
        try {
          const codebaseContext = await buildCodebaseSnapshot(workspaceFolder.uri.fsPath);
          const generated = await generateProjectDraft(objective.trim(), config, workspaceFolder.uri.fsPath, codebaseContext);
```

- [ ] **Step 3: Update the `newProject` call site**

Find this block (around line 624–627 in `registerCommands.ts`):

```typescript
      if (objective?.trim()) {
        progress.report({ message: 'Generating PRD and tasks — this may take a moment…' });
        try {
          const generated = await generateProjectDraft(objective.trim(), config, workspaceFolder.uri.fsPath);
```

Replace the `generateProjectDraft` call with:

```typescript
      if (objective?.trim()) {
        progress.report({ message: 'Generating PRD and tasks — this may take a moment…' });
        try {
          const codebaseContext = await buildCodebaseSnapshot(workspaceFolder.uri.fsPath);
          const generated = await generateProjectDraft(objective.trim(), config, workspaceFolder.uri.fsPath, codebaseContext);
```

- [ ] **Step 4: Run full validation**

```bash
cd ralph-codex-vscode-starter && npm run validate 2>&1 | tail -30
```

Expected: compile, docs check, lint, tests all pass.

- [ ] **Step 5: Commit**

```bash
cd ralph-codex-vscode-starter && git add src/commands/registerCommands.ts && git commit -m "feat: pass codebase snapshot to generateProjectDraft in initializeWorkspace and newProject"
```

---

## Verification

End-to-end smoke test (manual):

1. Open a workspace with existing TypeScript files (e.g., this repo)
2. Run `Ralphdex: Initialize Workspace` or `Ralphdex: New Project`
3. Enter an objective like "refactor into a function app"
4. Observe: the generated `prd.md` should acknowledge that no Azure Function structure exists yet and scope the PRD toward introducing it — not toward refactoring an existing function app
5. Check: `prd.md` and `tasks.json` are written and opened in the editor

Unit test check:

```bash
cd ralph-codex-vscode-starter && node --test test/projectGenerator.test.ts test/codebaseSnapshot.test.ts 2>&1 | grep -E "pass|fail|Error"
```

Expected: all tests reported as passing, no failures.

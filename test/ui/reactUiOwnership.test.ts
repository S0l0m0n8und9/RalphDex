import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// React-first UI ownership guard (issue #75).
//
// The React tree under `src/webview-ui/` is the single dashboard/sidebar
// renderer; shared host plumbing lives under `src/webview/` and the VS Code
// adapters under `src/ui/` (see docs/architecture.md § UI Ownership Boundary).
// Historic reference-only / legacy UI surfaces (e.g. the old `UXrefresh/`
// reference tree) are not part of the production renderer.
//
// This guard is deterministic and green for the shipped repository state; it
// only fails on drift — i.e. if a reference/archive UI tree is reintroduced as
// a directory or imported by production code under `src/`.
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const SRC_ROOT = path.join(REPO_ROOT, 'src');

/**
 * Path segments that identify a reference-only / archived / legacy UI tree.
 * Matched case-insensitively against directory names and import specifiers.
 */
const FORBIDDEN_UI_TREE_SEGMENTS = [
  'uxrefresh',
  'ux-refresh',
  'ux-reference',
  'reference-ui',
  'ui-reference',
  'legacy-ui',
  'legacy-webview',
  'webview-legacy',
  'ui-archive',
  'archive-ui'
];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Extracts module specifiers from `import ... from '...'`, `import('...')`, and `require('...')`. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function matchedForbiddenSegment(value: string): string | undefined {
  const segments = value.toLowerCase().split(/[\\/]/);
  return FORBIDDEN_UI_TREE_SEGMENTS.find((forbidden) => segments.includes(forbidden));
}

test('src/webview-ui React shell is present as the authoritative renderer', () => {
  for (const file of ['App.tsx', 'main.tsx']) {
    assert.ok(
      fs.existsSync(path.join(SRC_ROOT, 'webview-ui', file)),
      `expected the authoritative React shell file src/webview-ui/${file} to exist`
    );
  }
});

test('no reference/archive UI tree exists under the repo root or src/', () => {
  for (const root of [REPO_ROOT, SRC_ROOT]) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const forbidden = matchedForbiddenSegment(entry.name);
      assert.equal(
        forbidden,
        undefined,
        `reference/archive UI tree "${entry.name}" must not exist (matched forbidden segment "${forbidden}"); `
          + 'the React shell under src/webview-ui/ is the single renderer.'
      );
    }
  }
});

test('production code under src/ does not import a reference/archive UI tree', () => {
  const offenders: string[] = [];
  for (const file of listSourceFiles(SRC_ROOT)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      const forbidden = matchedForbiddenSegment(specifier);
      if (forbidden) {
        offenders.push(`${path.relative(REPO_ROOT, file)} imports "${specifier}" (forbidden tree "${forbidden}")`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `production code must not import reference/archive UI trees:\n${offenders.join('\n')}`
  );
});

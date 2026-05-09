# UX Refresh — Dashboard & Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the VS Code activity-bar sidebar and editor-panel dashboard with a unified React UI built from the hi-fi design in `UXrefresh/`, wired to real `RalphDashboardState`.

**Architecture:** New shared component library under `src/webview-ui/components/` (primitives, hero, panels, tasks, orchestration). Both `SidebarShell` and `DashboardShell` are fully rewritten to use these components. A `DashboardMode` (simple/standard/advanced) is persisted in webview state and passed through the tree. All unimplemented features are hidden; see `docs/superpowers/specs/2026-05-09-ux-refresh-dashboard-design.md` for the deferred register.

**Tech Stack:** React 19, TypeScript, `node:test` + `react-dom/server` for component tests, esbuild for browser bundle, VS Code webview API.

**Spec:** `docs/superpowers/specs/2026-05-09-ux-refresh-dashboard-design.md`

---

## File Map

**Create:**
- `src/webview-ui/components/primitives/Card.tsx` — Card, StatusPill, Btn, HealthPulse, Icon, formatBytes
- `src/webview-ui/components/hero/PhaseTracker.tsx`
- `src/webview-ui/components/hero/HealthCell.tsx`
- `src/webview-ui/components/hero/HeroNow.tsx`
- `src/webview-ui/components/panels/AgentLanes.tsx`
- `src/webview-ui/components/panels/Timeline.tsx`
- `src/webview-ui/components/panels/FailurePanel.tsx`
- `src/webview-ui/components/panels/DiagnosticsPanel.tsx`
- `src/webview-ui/components/tasks/TaskPanel.tsx`
- `src/webview-ui/components/orchestration/Orchestration.tsx`
- `test/ui/phaseTracker.test.tsx`
- `test/ui/healthCell.test.tsx`
- `test/ui/heroNow.test.tsx`
- `test/ui/agentLanes.test.tsx`
- `test/ui/timeline.test.tsx`
- `test/ui/failurePanel.test.tsx`
- `test/ui/diagnosticsPanel.test.tsx`
- `test/ui/taskPanel.test.tsx`
- `test/ui/orchestration.test.tsx`

**Modify:**
- `tsconfig.test.json` — add `"jsx": "react-jsx"` and TSX includes
- `src/webview-ui/styles/main.css` — add `--rdx-surface`, `--rdx-ok`, `--rdx-dim`, `--rdx-accent`, `--rdx-bad`, `--rdx-mono`, `--rdx-cyan` tokens
- `src/webview-ui/viewModel.ts` — add `DashboardMode` type export
- `src/webview-ui/App.tsx` — add mode state + `onOpenArtifact` dispatcher; pass new props to shells
- `src/webview-ui/components/SidebarShell.tsx` — full rewrite (new tabbed design)
- `src/webview-ui/components/DashboardShell.tsx` — full rewrite (tab bar, full-width)
- `package.json` — remove `ralphCodex.tasks` and `ralphCodex.logs` view registrations
- `src/extension.ts` — remove `taskTreeView` registration

---

## Task 0: Test infrastructure — TSX support

**Files:**
- Modify: `tsconfig.test.json`

- [ ] **Step 1: Add JSX and TSX support to test tsconfig**

Open `tsconfig.test.json` and replace with:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "out-test",
    "rootDir": ".",
    "sourceMap": false,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": [
    "src/**/*.ts",
    "src/webview-ui/**/*.tsx",
    "test/**/*.ts",
    "test/**/*.tsx"
  ],
  "exclude": []
}
```

`"lib": ["ES2022", "DOM"]` is needed because the tsx source files reference DOM types (React event types). The `"jsx": "react-jsx"` transform automatically imports from `react/jsx-runtime` — no explicit `import React` needed.

- [ ] **Step 2: Verify compilation still works**

```bash
npm run compile:tests
```

Expected: exits 0, `out-test/` populated. No new errors (webview-ui tsx files compile to CommonJS in `out-test/src/webview-ui/`).

- [ ] **Step 3: Commit**

```bash
git add tsconfig.test.json
git commit -m "test: enable TSX compilation in test tsconfig for component tests"
```

---

## Task 1: CSS design tokens

**Files:**
- Modify: `src/webview-ui/styles/main.css`

- [ ] **Step 1: Add new design tokens to `:root`**

Append to the existing `:root` block in `src/webview-ui/styles/main.css` (after `--rdx-focus`):

```css
  /* UX refresh tokens — new components use these semantic names */
  --rdx-surface:    var(--vscode-editor-background);
  --rdx-surface-2:  var(--vscode-sideBar-background, var(--vscode-editor-background));
  --rdx-ok:         var(--vscode-testing-iconPassed, #4ec994);
  --rdx-dim:        var(--vscode-descriptionForeground);
  --rdx-accent:     var(--vscode-button-background);
  --rdx-bad:        var(--vscode-errorForeground);
  --rdx-mono:       var(--vscode-editor-font-family, ui-monospace, 'Courier New', monospace);
  --rdx-cyan:       var(--vscode-terminal-ansiBrightCyan, #6fc3df);
```

Also add shell layout classes at the bottom of the file:

```css
/* UX refresh shell layouts */
.rdx-shell {
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  font-family: var(--rdx-font);
  background: var(--rdx-surface);
  color: var(--rdx-fg);
}

.rdx-shell-nav {
  width: 220px;
  flex-shrink: 0;
  background: var(--rdx-surface-2);
  border-right: 1px solid var(--rdx-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
}

.rdx-shell-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.rdx-tab-bar {
  display: flex;
  border-bottom: 1px solid var(--rdx-border);
  background: var(--rdx-surface-2);
  flex-shrink: 0;
  overflow-x: auto;
}

.rdx-tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@keyframes rdx-pulse {
  0%   { transform: scale(1);   opacity: 0.7; }
  100% { transform: scale(2.4); opacity: 0; }
}

@keyframes rdx-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
```

- [ ] **Step 2: Verify lint passes**

```bash
npm run lint
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/webview-ui/styles/main.css
git commit -m "style: add UX refresh design tokens and shell layout classes"
```

---

## Task 2: Primitives module

**Files:**
- Create: `src/webview-ui/components/primitives/Card.tsx`
- Create: `test/ui/primitives.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/ui/primitives.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Card, StatusPill, Btn, formatBytes } from '../../src/webview-ui/components/primitives/Card';

test('Card renders children and title', () => {
  const html = renderToStaticMarkup(
    <Card title="My Section"><span>content</span></Card>
  );
  assert.ok(html.includes('MY SECTION'), 'title should be uppercased');
  assert.ok(html.includes('content'));
});

test('Card renders accent top border when accent=true', () => {
  const html = renderToStaticMarkup(<Card accent>body</Card>);
  assert.ok(html.includes('var(--rdx-accent)'), 'accent border should reference accent token');
});

test('StatusPill applies running kind styles', () => {
  const html = renderToStaticMarkup(<StatusPill kind="running">Loop running</StatusPill>);
  assert.ok(html.includes('Loop running'));
  assert.ok(html.includes('var(--rdx-ok)'));
});

test('StatusPill applies bad kind styles', () => {
  const html = renderToStaticMarkup(<StatusPill kind="bad">error</StatusPill>);
  assert.ok(html.includes('var(--rdx-bad)'));
});

test('Btn renders label and applies primary variant', () => {
  const html = renderToStaticMarkup(<Btn variant="primary">Start loop</Btn>);
  assert.ok(html.includes('Start loop'));
  assert.ok(html.includes('var(--rdx-accent)'));
});

test('Btn renders danger variant', () => {
  const html = renderToStaticMarkup(<Btn variant="danger">Stop</Btn>);
  assert.ok(html.includes('var(--rdx-bad)'));
});

test('formatBytes formats bytes correctly', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(8400), '8.2 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/primitives.test.js
```

Expected: FAIL — `Cannot find module '../../src/webview-ui/components/primitives/Card'`

- [ ] **Step 3: Create `src/webview-ui/components/primitives/Card.tsx`**

```tsx
import React from 'react';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- Card ---------------------------------------------------------------

interface CardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  padding?: string;
  accent?: boolean;
}

export function Card({ title, subtitle, action, children, style, padding = '16px 18px', accent = false }: CardProps) {
  return (
    <section style={{
      background: 'var(--rdx-surface)',
      border: '1px solid var(--rdx-border)',
      borderRadius: 8,
      padding,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      borderTop: accent ? '2px solid var(--rdx-accent)' : '1px solid var(--rdx-border)',
      ...style,
    }}>
      {(title || action) && (
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: subtitle ? 2 : 12 }}>
          {title && (
            <h3 style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 1.4,
              textTransform: 'uppercase', color: 'var(--rdx-dim)', margin: 0, flex: 1,
            }}>
              {title}
            </h3>
          )}
          {action}
        </header>
      )}
      {subtitle && <p style={{ fontSize: 12, color: 'var(--rdx-dim)', margin: '0 0 12px 0' }}>{subtitle}</p>}
      {children}
    </section>
  );
}

// ---- StatusPill ---------------------------------------------------------

type StatusPillKind = 'running' | 'idle' | 'stopped' | 'warn' | 'bad' | 'ok' | 'accent' | 'neutral';

interface StatusPillProps {
  kind?: StatusPillKind;
  small?: boolean;
  children: React.ReactNode;
}

const PILL_STYLES: Record<StatusPillKind, { bg: string; fg: string; bd: string }> = {
  running: { bg: 'color-mix(in srgb, var(--rdx-ok) 12%, transparent)',     fg: 'var(--rdx-ok)',     bd: 'color-mix(in srgb, var(--rdx-ok) 35%, transparent)' },
  idle:    { bg: 'color-mix(in srgb, var(--rdx-dim) 14%, transparent)',    fg: 'var(--rdx-dim)',    bd: 'var(--rdx-border)' },
  stopped: { bg: 'color-mix(in srgb, var(--rdx-warn) 12%, transparent)',   fg: 'var(--rdx-warn)',   bd: 'color-mix(in srgb, var(--rdx-warn) 35%, transparent)' },
  warn:    { bg: 'color-mix(in srgb, var(--rdx-warn) 12%, transparent)',   fg: 'var(--rdx-warn)',   bd: 'color-mix(in srgb, var(--rdx-warn) 35%, transparent)' },
  bad:     { bg: 'color-mix(in srgb, var(--rdx-bad) 12%, transparent)',    fg: 'var(--rdx-bad)',    bd: 'color-mix(in srgb, var(--rdx-bad) 35%, transparent)' },
  ok:      { bg: 'color-mix(in srgb, var(--rdx-ok) 12%, transparent)',     fg: 'var(--rdx-ok)',     bd: 'color-mix(in srgb, var(--rdx-ok) 35%, transparent)' },
  accent:  { bg: 'color-mix(in srgb, var(--rdx-accent) 14%, transparent)', fg: 'var(--rdx-accent)', bd: 'color-mix(in srgb, var(--rdx-accent) 40%, transparent)' },
  neutral: { bg: 'transparent',                                              fg: 'var(--rdx-fg)',     bd: 'var(--rdx-border)' },
};

export function StatusPill({ kind = 'neutral', small, children }: StatusPillProps) {
  const s = PILL_STYLES[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: small ? '2px 7px' : '3px 9px',
      borderRadius: 999,
      background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
      fontSize: small ? 10 : 11, fontWeight: 600, letterSpacing: 0.3,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

// ---- Btn ----------------------------------------------------------------

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md' | 'lg';

interface BtnProps {
  variant?: BtnVariant;
  size?: BtnSize;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}

const BTN_VARIANTS: Record<BtnVariant, { bg: string; fg: string; bd: string }> = {
  primary:   { bg: 'var(--rdx-accent)',   fg: 'var(--rdx-primary-fg)',  bd: 'var(--rdx-accent)' },
  secondary: { bg: 'var(--rdx-surface-2)',fg: 'var(--rdx-fg)',           bd: 'var(--rdx-border)' },
  ghost:     { bg: 'transparent',          fg: 'var(--rdx-dim)',          bd: 'transparent' },
  danger:    { bg: 'transparent',          fg: 'var(--rdx-bad)',          bd: 'color-mix(in srgb, var(--rdx-bad) 40%, transparent)' },
};

const BTN_SIZES: Record<BtnSize, { p: string; fs: number }> = {
  sm: { p: '4px 10px', fs: 11 },
  md: { p: '7px 13px', fs: 12 },
  lg: { p: '10px 18px', fs: 13 },
};

export function Btn({ variant = 'secondary', size = 'md', children, onClick, disabled, style }: BtnProps) {
  const v = BTN_VARIANTS[variant];
  const s = BTN_SIZES[size];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: s.p, fontSize: s.fs,
        fontWeight: variant === 'primary' ? 600 : 500,
        background: v.bg, color: v.fg, border: `1px solid ${v.bd}`,
        borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit', letterSpacing: 0.1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ---- HealthPulse --------------------------------------------------------

interface HealthPulseProps {
  state: 'running' | 'idle' | 'stopped';
}

export function HealthPulse({ state }: HealthPulseProps) {
  const color = state === 'running' ? 'var(--rdx-ok)' : state === 'stopped' ? 'var(--rdx-warn)' : 'var(--rdx-dim)';
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 10, height: 10, flexShrink: 0 }}>
      {state === 'running' && (
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%', background: color,
          animation: 'rdx-pulse 1.6s ease-out infinite', opacity: 0.35,
        }} />
      )}
      <span style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: color }} />
    </span>
  );
}

// ---- Icon set -----------------------------------------------------------

export const Icon = {
  play:  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  stop:  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>,
  check: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5 11-11"/></svg>,
  warn:  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>,
  x:     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  bolt:  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>,
  dot:   <svg width="6"  height="6"  viewBox="0 0 6 6"   fill="currentColor"><circle cx="3" cy="3" r="3"/></svg>,
  cog:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8 2 2 0 01-2.8 2.8 1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3 2 2 0 01-2.8-2.8 1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 010-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8 2 2 0 012.8-2.8 1.6 1.6 0 001.8.3 1.6 1.6 0 001-1.5V3a2 2 0 014 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3 2 2 0 012.8 2.8 1.6 1.6 0 00-.3 1.8 1.6 1.6 0 001.5 1H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z"/></svg>,
  graph: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7 7l4 9M17 7l-4 9"/></svg>,
  plus:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  ask:   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4M12 17h.01"/></svg>,
  arrow: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/primitives.test.js
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/webview-ui/components/primitives/Card.tsx test/ui/primitives.test.tsx
git commit -m "feat(webview): add shared primitives module (Card, Btn, StatusPill, Icon)"
```

---

## Task 3: PhaseTracker

**Files:**
- Create: `src/webview-ui/components/hero/PhaseTracker.tsx`
- Create: `test/ui/phaseTracker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/ui/phaseTracker.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhaseTracker } from '../../src/webview-ui/components/hero/PhaseTracker';

test('PhaseTracker renders all 7 phases', () => {
  const html = renderToStaticMarkup(<PhaseTracker phase="execute" />);
  for (const p of ['inspect','select','prompt','execute','verify','classify','persist']) {
    assert.ok(html.includes(p), `missing phase: ${p}`);
  }
});

test('PhaseTracker marks active phase with accent color', () => {
  const html = renderToStaticMarkup(<PhaseTracker phase="execute" />);
  assert.ok(html.includes('var(--rdx-accent)'), 'active phase should use accent color');
});

test('PhaseTracker renders nothing when phase is null', () => {
  const html = renderToStaticMarkup(<PhaseTracker phase={null} />);
  assert.equal(html, '');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/phaseTracker.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/webview-ui/components/hero/PhaseTracker.tsx`**

```tsx
import React from 'react';
import type { RalphIterationPhase } from '../../../ui/uiTypes';

const PHASES: RalphIterationPhase[] = ['inspect','select','prompt','execute','verify','classify','persist'];

interface PhaseTrackerProps {
  phase: RalphIterationPhase | null;
  compact?: boolean;
}

export function PhaseTracker({ phase, compact }: PhaseTrackerProps) {
  if (phase === null) return null;
  const activeIdx = PHASES.indexOf(phase);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 3 : 5, flexWrap: 'wrap' }}>
      {PHASES.map((p, i) => {
        const done = i < activeIdx;
        const now  = i === activeIdx;
        return (
          <React.Fragment key={p}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: compact ? '2px 6px' : '4px 9px',
              borderRadius: 5,
              fontSize: compact ? 10 : 11,
              background: now ? 'color-mix(in srgb, var(--rdx-accent) 18%, transparent)' : done ? 'var(--rdx-surface-2)' : 'transparent',
              color: now ? 'var(--rdx-accent)' : done ? 'var(--rdx-fg)' : 'var(--rdx-dim)',
              border: `1px solid ${now ? 'color-mix(in srgb, var(--rdx-accent) 50%, transparent)' : done ? 'var(--rdx-border)' : 'transparent'}`,
              fontWeight: now ? 600 : 400,
            }}>
              {done && <span style={{ opacity: 0.7, fontSize: 9 }}>✓</span>}
              {now && (
                <span style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--rdx-accent)',
                  animation: 'rdx-blink 1.1s ease-in-out infinite',
                }} />
              )}
              {p}
            </div>
            {i < PHASES.length - 1 && (
              <span style={{ color: 'var(--rdx-border)', fontSize: 9 }}>—</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/phaseTracker.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/webview-ui/components/hero/PhaseTracker.tsx test/ui/phaseTracker.test.tsx
git commit -m "feat(webview): add PhaseTracker component"
```

---

## Task 4: HealthCell

**Files:**
- Create: `src/webview-ui/components/hero/HealthCell.tsx`
- Create: `test/ui/healthCell.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/ui/healthCell.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HealthCell } from '../../src/webview-ui/components/hero/HealthCell';

test('HealthCell renders label, value, and sub', () => {
  const html = renderToStaticMarkup(
    <HealthCell label="Progress" value="14/27" sub="51% done" />
  );
  assert.ok(html.includes('PROGRESS'));
  assert.ok(html.includes('14/27'));
  assert.ok(html.includes('51% done'));
});

test('HealthCell renders progress bar when bar prop given', () => {
  const html = renderToStaticMarkup(
    <HealthCell label="Iteration" value="7/12" sub="58% of cap" bar={58} />
  );
  assert.ok(html.includes('width:'), 'should include bar width');
  assert.ok(html.includes('58%'), 'bar should be 58%');
});

test('HealthCell applies warn tone color', () => {
  const html = renderToStaticMarkup(
    <HealthCell label="Attention" value="3" sub="3 blocked" tone="warn" />
  );
  assert.ok(html.includes('var(--rdx-warn)'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/healthCell.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/webview-ui/components/hero/HealthCell.tsx`**

```tsx
import React from 'react';

interface HealthCellProps {
  label: string;
  value: string;
  sub: string;
  bar?: number;
  barColor?: string;
  tone?: 'ok' | 'warn' | 'bad' | 'neutral';
}

const TONE_COLOR: Record<NonNullable<HealthCellProps['tone']>, string> = {
  ok:      'var(--rdx-ok)',
  warn:    'var(--rdx-warn)',
  bad:     'var(--rdx-bad)',
  neutral: 'var(--rdx-fg)',
};

export function HealthCell({ label, value, sub, bar, barColor = 'var(--rdx-accent)', tone = 'neutral' }: HealthCellProps) {
  return (
    <div style={{
      padding: '12px 14px',
      borderRight: '1px solid var(--rdx-border)',
      display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0,
    }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--rdx-dim)', fontWeight: 600 }}>
        {label}
      </span>
      <span style={{
        fontSize: 20, fontWeight: 500, color: TONE_COLOR[tone], letterSpacing: -0.3,
        fontFamily: 'var(--rdx-mono)', lineHeight: 1,
      }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--rdx-dim)' }}>{sub}</span>
      {typeof bar === 'number' && (
        <div style={{ height: 3, background: 'var(--rdx-border)', borderRadius: 2, overflow: 'hidden', marginTop: 1 }}>
          <div style={{ height: '100%', width: `${Math.min(100, bar)}%`, background: barColor }} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/healthCell.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/webview-ui/components/hero/HealthCell.tsx test/ui/healthCell.test.tsx
git commit -m "feat(webview): add HealthCell component"
```

---

## Task 5: HeroNow

**Files:**
- Create: `src/webview-ui/components/hero/HeroNow.tsx`
- Create: `test/ui/heroNow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/ui/heroNow.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeroNow } from '../../src/webview-ui/components/hero/HeroNow';
import type { RalphDashboardState } from '../../src/ui/uiTypes';
import type { WebviewUiModel } from '../../src/webview-ui/viewModel';

function makeState(overrides: Partial<RalphDashboardState> = {}): RalphDashboardState {
  return {
    workspaceName: 'test-ws', loopState: 'idle', agentRole: 'build',
    nextIteration: 3, iterationCap: 12,
    taskCounts: { todo: 5, in_progress: 1, blocked: 0, done: 4 },
    tasks: [], recentIterations: [], preflightReady: true, preflightSummary: 'ok',
    diagnostics: [], agentLanes: [], settingsSurface: null, dashboardSnapshot: null,
    snapshotStatus: { phase: 'idle', errorMessage: null },
    taskSeeding: { phase: 'idle', requestText: '', createdTaskCount: null, message: null, artifactPath: null },
    viewIntent: null, prdExists: true, ...overrides,
  };
}

function makeModel(overrides: Partial<WebviewUiModel> = {}): WebviewUiModel {
  return {
    readiness: { kind: 'ready', title: 'Ready', detail: 'Ralph is ready to run.' },
    primaryCommands: [], secondaryCommands: [], exposedCommandIds: new Set(),
    taskTotal: 10, doneCount: 4, currentTask: null, ...overrides,
  };
}

test('HeroNow shows Start button when loop is idle', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState({ loopState: 'idle' })} model={makeModel()} mode="standard"
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('Start loop'));
  assert.ok(!html.includes('Stop loop'));
});

test('HeroNow shows Stop button when loop is running', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState({ loopState: 'running' })} model={makeModel()} mode="standard"
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('Stop loop'));
  assert.ok(!html.includes('Start loop'));
});

test('HeroNow simple mode shows plain-English readiness text', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState()} model={makeModel({ readiness: { kind: 'ready', title: 'Ready', detail: 'Ralph is idle. 4 of 10 tasks done.' } })}
      mode="simple" onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('Ralph is idle. 4 of 10 tasks done.'));
});

test('HeroNow standard mode shows task ID when current task is set', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState({ loopState: 'running' })}
      model={makeModel({ currentTask: { id: 'T-42', title: 'Fix the thing', status: 'in_progress', isCurrent: true, priority: 'high', childIds: [], dependsOn: [] } })}
      mode="standard" onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('T-42'));
  assert.ok(html.includes('Fix the thing'));
});

test('HeroNow shows Run one iteration only in standard and advanced', () => {
  const htmlStd = renderToStaticMarkup(
    <HeroNow state={makeState()} model={makeModel()} mode="standard"
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(htmlStd.includes('Run one iteration'));

  const htmlSimple = renderToStaticMarkup(
    <HeroNow state={makeState()} model={makeModel()} mode="simple"
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(!htmlSimple.includes('Run one iteration'));
});

test('HeroNow renders health strip', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState()} model={makeModel()} mode="standard"
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('PROGRESS'));
  assert.ok(html.includes('ITERATION'));
  assert.ok(html.includes('ATTENTION'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/heroNow.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Add `DashboardMode` type to `src/webview-ui/viewModel.ts`**

Append to the end of `src/webview-ui/viewModel.ts`:

```typescript
export type DashboardMode = 'simple' | 'standard' | 'advanced';
```

- [ ] **Step 4: Create `src/webview-ui/components/hero/HeroNow.tsx`**

```tsx
import React from 'react';
import type { RalphDashboardState } from '../../../ui/uiTypes';
import type { WebviewUiModel, DashboardMode } from '../../viewModel';
import { Card, StatusPill, Btn, HealthPulse, Icon, formatBytes } from '../primitives/Card';
import { PhaseTracker } from './PhaseTracker';
import { HealthCell } from './HealthCell';

interface HeroNowProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
  mode: DashboardMode;
  onStartLoop: () => void;
  onStopLoop: () => void;
  onRunIteration: () => void;
}

export function HeroNow({ state, model, mode, onStartLoop, onStopLoop, onRunIteration }: HeroNowProps) {
  const running = state.loopState === 'running';
  const total   = model.taskTotal;
  const done    = model.doneCount;
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
  const iterPct = state.iterationCap > 0 ? Math.round((state.nextIteration / state.iterationCap) * 100) : 0;
  const attention = state.taskCounts?.blocked ?? 0;
  const snapshot  = state.dashboardSnapshot;
  const cacheStats = snapshot?.cost.promptCacheStats ?? null;

  const loopPillKind = running ? 'running' : state.loopState === 'stopped' ? 'stopped' : 'idle';

  return (
    <Card accent padding="18px 20px" style={{ gap: 14 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Left: status + task info */}
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <HealthPulse state={state.loopState} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--rdx-dim)' }}>
              Now
            </span>
            <StatusPill kind={loopPillKind} small>
              {running ? 'Loop running' : state.loopState === 'stopped' ? 'Loop stopped' : 'Loop idle'}
            </StatusPill>
            {running && (
              <span style={{ fontSize: 11, color: 'var(--rdx-dim)' }}>
                iteration <b style={{ color: 'var(--rdx-fg)', fontFamily: 'var(--rdx-mono)' }}>{state.nextIteration}</b> / {state.iterationCap}
              </span>
            )}
          </div>

          {mode === 'simple' ? (
            <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: 'var(--rdx-fg)' }}>
              {model.readiness.detail}
            </p>
          ) : (
            <>
              {model.currentTask ? (
                <>
                  <div style={{ fontSize: 11, color: 'var(--rdx-dim)', marginBottom: 4 }}>Current task</div>
                  <div style={{
                    display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap',
                    fontSize: 15, fontWeight: 500, lineHeight: 1.3, marginBottom: 10,
                  }}>
                    <span style={{
                      fontFamily: 'var(--rdx-mono)', fontSize: 11,
                      padding: '2px 7px', background: 'var(--rdx-surface-2)',
                      border: '1px solid var(--rdx-border)', borderRadius: 4,
                      color: 'var(--rdx-accent)',
                    }}>
                      {model.currentTask.id}
                    </span>
                    <span>{model.currentTask.title}</span>
                  </div>
                  {state.agentLanes[0]?.phase != null && (
                    <PhaseTracker phase={state.agentLanes[0].phase} />
                  )}
                </>
              ) : (
                <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: 'var(--rdx-dim)' }}>
                  {model.readiness.detail}
                </p>
              )}
            </>
          )}
        </div>

        {/* Right: action buttons */}
        <div style={{ display: 'flex', gap: 7, flexShrink: 0, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {running ? (
            <Btn variant="danger" size="md" onClick={onStopLoop}>{Icon.stop} Stop loop</Btn>
          ) : (
            <Btn variant="primary" size="md" onClick={onStartLoop}>{Icon.play} Start loop</Btn>
          )}
          {mode !== 'simple' && (
            <Btn variant="secondary" size="md" onClick={onRunIteration}>
              {Icon.bolt} Run one iteration
            </Btn>
          )}
        </div>
      </div>

      {/* Health strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cacheStats ? 4 : 3}, minmax(120px, 1fr))`,
        border: '1px solid var(--rdx-border)', borderRadius: 6,
        overflow: 'hidden', background: 'var(--rdx-surface-2)',
      }}>
        <HealthCell
          label="Progress"
          value={`${done}/${total}`}
          sub={`${donePct}% done`}
          bar={donePct}
          barColor="var(--rdx-ok)"
        />
        <HealthCell
          label="Iteration"
          value={`${state.nextIteration}/${state.iterationCap}`}
          sub={`${iterPct}% of cap`}
          bar={iterPct}
        />
        <HealthCell
          label="Attention"
          value={String(attention)}
          sub={attention === 0 ? 'all clear' : `${attention} blocked`}
          tone={attention > 0 ? 'warn' : 'ok'}
        />
        {cacheStats && (
          <HealthCell
            label="Cache"
            value={formatBytes(cacheStats.staticPrefixBytes)}
            sub={
              cacheStats.cacheHit === null ? 'no cache data' :
              cacheStats.cacheHit ? 'cache hit' : 'cache miss'
            }
            tone={cacheStats.cacheHit === true ? 'ok' : 'neutral'}
          />
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/heroNow.test.js
```

Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/webview-ui/viewModel.ts src/webview-ui/components/hero/HeroNow.tsx test/ui/heroNow.test.tsx
git commit -m "feat(webview): add HeroNow hero card with health strip"
```

---

## Task 6: AgentLanes

**Files:**
- Create: `src/webview-ui/components/panels/AgentLanes.tsx`
- Create: `test/ui/agentLanes.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/ui/agentLanes.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentLanes } from '../../src/webview-ui/components/panels/AgentLanes';
import type { RalphAgentLaneState } from '../../src/ui/uiTypes';

const lane = (id: string, phase: RalphAgentLaneState['phase']): RalphAgentLaneState =>
  ({ agentId: id, phase, iteration: 3, message: undefined });

test('AgentLanes renders nothing when lanes array is empty', () => {
  const html = renderToStaticMarkup(<AgentLanes lanes={[]} />);
  assert.equal(html, '');
});

test('AgentLanes renders a row for each lane', () => {
  const html = renderToStaticMarkup(
    <AgentLanes lanes={[lane('impl-01', 'execute'), lane('review-01', 'verify')]} />
  );
  assert.ok(html.includes('impl-01'));
  assert.ok(html.includes('review-01'));
});

test('AgentLanes applies reviewer color for agentId containing "reviewer"', () => {
  const html = renderToStaticMarkup(<AgentLanes lanes={[lane('reviewer-01', 'verify')]} />);
  assert.ok(html.includes('var(--rdx-ok)'));
});

test('AgentLanes applies watchdog color for agentId containing "watchdog"', () => {
  const html = renderToStaticMarkup(<AgentLanes lanes={[lane('watchdog', 'inspect')]} />);
  assert.ok(html.includes('var(--rdx-warn)'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/agentLanes.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/webview-ui/components/panels/AgentLanes.tsx`**

```tsx
import React from 'react';
import type { RalphAgentLaneState } from '../../../ui/uiTypes';
import { Card } from '../primitives/Card';
import { PhaseTracker } from '../hero/PhaseTracker';

interface AgentLanesProps {
  lanes: RalphAgentLaneState[];
}

function roleColor(agentId: string): string {
  const id = agentId.toLowerCase();
  if (id.includes('reviewer')) return 'var(--rdx-ok)';
  if (id.includes('watchdog')) return 'var(--rdx-warn)';
  if (id.includes('scm'))      return 'var(--rdx-cyan)';
  return 'var(--rdx-accent)';
}

export function AgentLanes({ lanes }: AgentLanesProps) {
  if (lanes.length === 0) return null;
  return (
    <Card title="Agent Lanes" subtitle={`${lanes.length} active agent${lanes.length === 1 ? '' : 's'}`}>
      <div style={{ display: 'grid', gap: 7 }}>
        {lanes.map(lane => (
          <div key={lane.agentId} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '9px 11px',
            border: '1px solid var(--rdx-border)',
            borderLeft: `3px solid ${roleColor(lane.agentId)}`,
            borderRadius: 6,
            background: 'var(--rdx-surface-2)',
          }}>
            <div style={{ minWidth: 100, flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--rdx-mono)', fontSize: 12, fontWeight: 600, color: 'var(--rdx-fg)' }}>
                {lane.agentId}
              </div>
              {lane.iteration != null && (
                <div style={{ fontSize: 10, color: 'var(--rdx-dim)', marginTop: 1 }}>
                  iter <span style={{ color: 'var(--rdx-fg)', fontFamily: 'var(--rdx-mono)' }}>{lane.iteration}</span>
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PhaseTracker phase={lane.phase} compact />
            </div>
            {lane.message && (
              <div style={{
                fontSize: 11, color: 'var(--rdx-dim)', maxWidth: 200,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {lane.message}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/agentLanes.test.js
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/webview-ui/components/panels/AgentLanes.tsx test/ui/agentLanes.test.tsx
git commit -m "feat(webview): add AgentLanes component"
```

---

## Task 7: Timeline

**Files:**
- Create: `src/webview-ui/components/panels/Timeline.tsx`
- Create: `test/ui/timeline.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/ui/timeline.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Timeline } from '../../src/webview-ui/components/panels/Timeline';
import type { RalphDashboardIteration } from '../../src/ui/uiTypes';

const iter = (n: number, classification: RalphDashboardIteration['classification']): RalphDashboardIteration => ({
  iteration: n, taskId: 'T-1', taskTitle: 'Do thing', classification,
  stopReason: null, artifactDir: `/artifacts/${n}`,
});

test('Timeline renders nothing when iterations array is empty', () => {
  const html = renderToStaticMarkup(<Timeline iterations={[]} onOpenArtifact={() => {}} />);
  assert.equal(html, '');
});

test('Timeline renders a row for each iteration', () => {
  const html = renderToStaticMarkup(
    <Timeline iterations={[iter(1, 'complete'), iter(2, 'partial_progress')]} onOpenArtifact={() => {}} />
  );
  assert.ok(html.includes('#1'));
  assert.ok(html.includes('#2'));
});

test('Timeline applies ok color for complete classification', () => {
  const html = renderToStaticMarkup(
    <Timeline iterations={[iter(1, 'complete')]} onOpenArtifact={() => {}} />
  );
  assert.ok(html.includes('var(--rdx-ok)'));
});

test('Timeline applies bad color for failed classification', () => {
  const html = renderToStaticMarkup(
    <Timeline iterations={[iter(1, 'failed')]} onOpenArtifact={() => {}} />
  );
  assert.ok(html.includes('var(--rdx-bad)'));
});

test('Timeline shows task ID and classification text', () => {
  const html = renderToStaticMarkup(
    <Timeline iterations={[iter(5, 'no_progress')]} onOpenArtifact={() => {}} />
  );
  assert.ok(html.includes('T-1'));
  assert.ok(html.includes('no progress'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/timeline.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/webview-ui/components/panels/Timeline.tsx`**

```tsx
import React from 'react';
import type { RalphDashboardIteration, RalphCompletionClassification } from '../../../ui/uiTypes';
import { Card } from '../primitives/Card';

interface TimelineProps {
  iterations: RalphDashboardIteration[];
  onOpenArtifact: (artifactDir: string) => void;
}

const CLASS_COLOR: Record<RalphCompletionClassification, string> = {
  complete:             'var(--rdx-ok)',
  already_satisfied:    'var(--rdx-ok)',
  partial_progress:     'var(--rdx-accent)',
  no_progress:          'var(--rdx-dim)',
  blocked:              'var(--rdx-warn)',
  failed:               'var(--rdx-bad)',
  needs_human_review:   'var(--rdx-cyan)',
};

export function Timeline({ iterations, onOpenArtifact }: TimelineProps) {
  if (iterations.length === 0) return null;
  return (
    <Card title="Iteration Timeline" subtitle="Most recent first · click row to inspect artifact">
      <div style={{ display: 'grid', gap: 3 }}>
        {iterations.map(it => {
          const color = CLASS_COLOR[it.classification] ?? 'var(--rdx-dim)';
          return (
            <button
              key={it.iteration}
              onClick={() => onOpenArtifact(it.artifactDir)}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 60px minmax(0,1fr) 120px 70px',
                gap: 8, alignItems: 'center',
                padding: '7px 10px',
                background: 'var(--rdx-surface-2)',
                border: '1px solid var(--rdx-border)',
                borderRadius: 5,
                fontFamily: 'inherit', color: 'var(--rdx-fg)',
                cursor: 'pointer', textAlign: 'left', fontSize: 12,
              }}
            >
              <span style={{ fontFamily: 'var(--rdx-mono)', color: 'var(--rdx-dim)', fontSize: 11 }}>
                #{it.iteration}
              </span>
              <span style={{ fontFamily: 'var(--rdx-mono)', fontSize: 11, color: 'var(--rdx-accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.taskId ?? '—'}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                color, fontSize: 12, fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {it.classification.replace(/_/g, ' ')}
              </span>
              <span style={{ fontFamily: 'var(--rdx-mono)', fontSize: 11, color: 'var(--rdx-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.stopReason ? it.stopReason.replace(/_/g, ' ') : ''}
              </span>
              <span style={{ fontFamily: 'var(--rdx-mono)', fontSize: 11, color: 'var(--rdx-dim)', textAlign: 'right' }}>
                {it.agentId ?? ''}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/timeline.test.js
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/webview-ui/components/panels/Timeline.tsx test/ui/timeline.test.tsx
git commit -m "feat(webview): add Timeline iteration history component"
```

---

## Task 8: FailurePanel

**Files:**
- Create: `src/webview-ui/components/panels/FailurePanel.tsx`
- Create: `test/ui/failurePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/ui/failurePanel.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { FailurePanel } from '../../src/webview-ui/components/panels/FailurePanel';
import type { DiagnosisSection } from '../../src/webview/dashboardSnapshot';

const diagnosis: DiagnosisSection = {
  taskId: 'T-42', taskTitle: 'Fix the webhook',
  category: 'validation_mismatch', confidence: 'high',
  summary: 'Retry-After header uses wrong unit.',
  suggestedAction: 'Convert delay to seconds.',
  retryPromptAddendum: null, recoveryAttemptCount: 2,
  remediationSummary: null, failureAnalysisPath: '/path/to/analysis',
  recoveryStatePath: null,
};

test('FailurePanel shows task ID, category, and confidence', () => {
  const html = renderToStaticMarkup(<FailurePanel diagnosis={diagnosis} onOpenArtifact={() => {}} />);
  assert.ok(html.includes('T-42'));
  assert.ok(html.includes('validation mismatch'));
  assert.ok(html.includes('high'));
});

test('FailurePanel shows summary and suggested action', () => {
  const html = renderToStaticMarkup(<FailurePanel diagnosis={diagnosis} onOpenArtifact={() => {}} />);
  assert.ok(html.includes('Retry-After header uses wrong unit.'));
  assert.ok(html.includes('Convert delay to seconds.'));
});

test('FailurePanel shows attempt count', () => {
  const html = renderToStaticMarkup(<FailurePanel diagnosis={diagnosis} onOpenArtifact={() => {}} />);
  assert.ok(html.includes('2'));
});

test('FailurePanel shows open-artifact button when failureAnalysisPath is present', () => {
  const html = renderToStaticMarkup(<FailurePanel diagnosis={diagnosis} onOpenArtifact={() => {}} />);
  assert.ok(html.includes('Open failure artifact'));
});

test('FailurePanel hides open-artifact button when failureAnalysisPath is null', () => {
  const html = renderToStaticMarkup(
    <FailurePanel diagnosis={{ ...diagnosis, failureAnalysisPath: null }} onOpenArtifact={() => {}} />
  );
  assert.ok(!html.includes('Open failure artifact'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/failurePanel.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/webview-ui/components/panels/FailurePanel.tsx`**

```tsx
import React from 'react';
import type { DiagnosisSection } from '../../../webview/dashboardSnapshot';
import { Card, StatusPill, Btn, Icon } from '../primitives/Card';

interface FailurePanelProps {
  diagnosis: DiagnosisSection;
  onOpenArtifact: (path: string) => void;
}

export function FailurePanel({ diagnosis: d, onOpenArtifact }: FailurePanelProps) {
  const confidenceKind = d.confidence === 'high' ? 'bad' : d.confidence === 'medium' ? 'warn' : 'neutral';
  return (
    <Card padding="14px 16px" style={{
      borderColor: 'color-mix(in srgb, var(--rdx-bad) 40%, var(--rdx-border))',
      background: 'color-mix(in srgb, var(--rdx-bad) 4%, var(--rdx-surface))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: 'var(--rdx-bad)', display: 'flex' }}>{Icon.warn}</span>
        <h3 style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--rdx-bad)', margin: 0, flex: 1 }}>
          Needs Attention · Failure Diagnosis
        </h3>
        <StatusPill kind={confidenceKind} small>{d.confidence} confidence</StatusPill>
      </div>

      <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--rdx-mono)', fontSize: 11, padding: '2px 6px',
          background: 'var(--rdx-surface-2)', border: '1px solid var(--rdx-border)',
          borderRadius: 3, color: 'var(--rdx-accent)',
        }}>
          {d.taskId}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{d.taskTitle}</span>
        {d.recoveryAttemptCount != null && d.recoveryAttemptCount > 0 && (
          <span style={{ fontSize: 11, color: 'var(--rdx-dim)', marginLeft: 'auto' }}>
            attempt {d.recoveryAttemptCount} · <b style={{ color: 'var(--rdx-fg)' }}>{d.category.replace(/_/g, ' ')}</b>
          </span>
        )}
      </div>

      <div style={{
        background: 'var(--rdx-surface-2)', border: '1px solid var(--rdx-border)',
        borderRadius: 5, padding: '10px 12px', marginBottom: 8,
      }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--rdx-dim)', fontWeight: 600, marginBottom: 4 }}>
          What went wrong
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>{d.summary}</p>
      </div>

      <div style={{
        border: '1px solid color-mix(in srgb, var(--rdx-accent) 35%, transparent)',
        background: 'color-mix(in srgb, var(--rdx-accent) 6%, transparent)',
        borderRadius: 5, padding: '10px 12px', marginBottom: 10,
      }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--rdx-accent)', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
          {Icon.bolt} Suggested fix
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>{d.suggestedAction}</p>
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {d.failureAnalysisPath && (
          <Btn size="sm" variant="secondary" onClick={() => onOpenArtifact(d.failureAnalysisPath!)}>
            Open failure artifact
          </Btn>
        )}
        {/* Skip task and Send to dead-letter are deferred — no commands registered yet */}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/failurePanel.test.js
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/webview-ui/components/panels/FailurePanel.tsx test/ui/failurePanel.test.tsx
git commit -m "feat(webview): add FailurePanel diagnosis component"
```

---

## Task 9: DiagnosticsPanel

**Files:**
- Create: `src/webview-ui/components/panels/DiagnosticsPanel.tsx`
- Create: `test/ui/diagnosticsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/ui/diagnosticsPanel.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiagnosticsPanel } from '../../src/webview-ui/components/panels/DiagnosticsPanel';

test('DiagnosticsPanel renders each diagnostic message', () => {
  const html = renderToStaticMarkup(
    <DiagnosticsPanel diagnostics={[
      { severity: 'ok',   message: 'Git tree clean' },
      { severity: 'warn', message: 'No validation command' },
      { severity: 'bad',  message: 'Provider not found' },
    ]} />
  );
  assert.ok(html.includes('Git tree clean'));
  assert.ok(html.includes('No validation command'));
  assert.ok(html.includes('Provider not found'));
});

test('DiagnosticsPanel applies ok color for ok severity', () => {
  const html = renderToStaticMarkup(
    <DiagnosticsPanel diagnostics={[{ severity: 'ok', message: 'All good' }]} />
  );
  assert.ok(html.includes('var(--rdx-ok)'));
});

test('DiagnosticsPanel applies bad color for bad severity', () => {
  const html = renderToStaticMarkup(
    <DiagnosticsPanel diagnostics={[{ severity: 'bad', message: 'Error' }]} />
  );
  assert.ok(html.includes('var(--rdx-bad)'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/diagnosticsPanel.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/webview-ui/components/panels/DiagnosticsPanel.tsx`**

```tsx
import React from 'react';
import { Card, Icon } from '../primitives/Card';

interface Diagnostic {
  severity: string;
  message: string;
}

interface DiagnosticsPanelProps {
  diagnostics: Diagnostic[];
}

function severityStyle(sev: string): { icon: React.ReactNode; color: string } {
  if (sev === 'ok')   return { icon: Icon.check, color: 'var(--rdx-ok)' };
  if (sev === 'warn') return { icon: Icon.warn,  color: 'var(--rdx-warn)' };
  if (sev === 'bad')  return { icon: Icon.x,     color: 'var(--rdx-bad)' };
  return { icon: Icon.dot, color: 'var(--rdx-dim)' };
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  return (
    <Card title="Preflight & Diagnostics">
      <div style={{ display: 'grid', gap: 5 }}>
        {diagnostics.map((d, i) => {
          const { icon, color } = severityStyle(d.severity);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, padding: '3px 0' }}>
              <span style={{ color, display: 'flex', flexShrink: 0 }}>{icon}</span>
              <span>{d.message}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/diagnosticsPanel.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/webview-ui/components/panels/DiagnosticsPanel.tsx test/ui/diagnosticsPanel.test.tsx
git commit -m "feat(webview): add DiagnosticsPanel preflight component"
```

---

## Task 10: TaskPanel

**Files:**
- Create: `src/webview-ui/components/tasks/TaskPanel.tsx`
- Create: `test/ui/taskPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/ui/taskPanel.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaskPanel } from '../../src/webview-ui/components/tasks/TaskPanel';
import type { RalphDashboardTask } from '../../src/ui/uiTypes';

const task = (id: string, status: RalphDashboardTask['status']): RalphDashboardTask => ({
  id, title: `Task ${id}`, status, isCurrent: false, priority: 'normal',
  childIds: [], dependsOn: [],
});

test('TaskPanel renders active tasks separately from done tasks', () => {
  const html = renderToStaticMarkup(
    <TaskPanel tasks={[
      task('T-1', 'in_progress'),
      task('T-2', 'todo'),
      task('T-3', 'done'),
    ]} />
  );
  assert.ok(html.includes('T-1'));
  assert.ok(html.includes('T-2'));
  assert.ok(html.includes('T-3'));
  assert.ok(html.includes('Active (2)'));
  assert.ok(html.includes('Completed (1)'));
});

test('TaskPanel shows blocked status in warn color', () => {
  const html = renderToStaticMarkup(
    <TaskPanel tasks={[{ ...task('T-1', 'blocked'), blocker: 'Waiting on Redis' }]} />
  );
  assert.ok(html.includes('var(--rdx-warn)'));
});

test('TaskPanel marks current task with accent indicator', () => {
  const html = renderToStaticMarkup(
    <TaskPanel tasks={[{ ...task('T-1', 'in_progress'), isCurrent: true }]} />
  );
  assert.ok(html.includes('current'));
});

test('TaskPanel renders empty state when no tasks', () => {
  const html = renderToStaticMarkup(<TaskPanel tasks={[]} />);
  assert.ok(html.includes('No tasks'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/taskPanel.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/webview-ui/components/tasks/TaskPanel.tsx`**

```tsx
import React, { useState } from 'react';
import type { RalphDashboardTask } from '../../../ui/uiTypes';
import { StatusPill } from '../primitives/Card';

interface TaskPanelProps {
  tasks: RalphDashboardTask[];
}

const STATUS_COLOR: Record<RalphDashboardTask['status'], string> = {
  in_progress: 'var(--rdx-accent)',
  blocked:     'var(--rdx-warn)',
  todo:        'var(--rdx-dim)',
  done:        'var(--rdx-ok)',
};

function TaskRow({ task }: { task: RalphDashboardTask }) {
  const [open, setOpen] = useState(false);
  const color = STATUS_COLOR[task.status];
  return (
    <div style={{ borderBottom: '1px solid var(--rdx-border)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          padding: '9px 4px',
          background: 'transparent', border: 'none',
          color: 'var(--rdx-fg)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--rdx-mono)', fontSize: 11, width: 52, flexShrink: 0, color: 'var(--rdx-dim)' }}>
          {task.id}
        </span>
        <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.title}
          {task.isCurrent && (
            <StatusPill kind="accent" small>current</StatusPill>
          )}
        </span>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color, fontWeight: 600, marginLeft: 4 }}>
          {task.status.replace('_', ' ')}
        </span>
        <span style={{ color: 'var(--rdx-dim)', fontSize: 10, marginLeft: 4 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 4px 12px 70px', fontSize: 12, color: 'var(--rdx-dim)', display: 'grid', gap: 5 }}>
          {task.blocker && (
            <DetailRow label="blocker" value={task.blocker} color="var(--rdx-warn)" />
          )}
          {task.notes && <DetailRow label="notes" value={task.notes} />}
          {task.validation && <DetailRow label="validation" value={task.validation} mono />}
          {task.parentId && <DetailRow label="parent" value={task.parentId} mono />}
          {task.childIds.length > 0 && <DetailRow label="children" value={task.childIds.join(', ')} mono />}
          {task.dependsOn.length > 0 && <DetailRow label="depends on" value={task.dependsOn.join(', ')} mono />}
          <DetailRow label="priority" value={task.priority} />
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, paddingTop: 2 }}>{label}</span>
      <span style={{ color: color ?? 'var(--rdx-fg)', fontFamily: mono ? 'var(--rdx-mono)' : 'inherit', fontSize: mono ? 11 : 12, lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  );
}

export function TaskPanel({ tasks }: TaskPanelProps) {
  if (tasks.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--rdx-dim)', fontSize: 13 }}>
        No tasks · add a PRD to get started
      </div>
    );
  }

  const active = tasks.filter(t => t.status !== 'done');
  const done   = tasks.filter(t => t.status === 'done');

  return (
    <div>
      {/* SVG task graph deferred — no dynamic layout solver */}
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--rdx-dim)', fontWeight: 600, marginBottom: 4 }}>
        Active ({active.length})
      </div>
      {active.map(t => <TaskRow key={t.id} task={t} />)}
      {done.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--rdx-dim)', fontWeight: 600, cursor: 'pointer', padding: '6px 0' }}>
            Completed ({done.length})
          </summary>
          {done.map(t => <TaskRow key={t.id} task={t} />)}
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/taskPanel.test.js
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/webview-ui/components/tasks/TaskPanel.tsx test/ui/taskPanel.test.tsx
git commit -m "feat(webview): add TaskPanel expandable task list"
```

---

## Task 11: Orchestration

**Files:**
- Create: `src/webview-ui/components/orchestration/Orchestration.tsx`
- Create: `test/ui/orchestration.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/ui/orchestration.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Orchestration } from '../../src/webview-ui/components/orchestration/Orchestration';
import type { DashboardCostSection } from '../../src/webview/dashboardSnapshot';

const costWithCache: DashboardCostSection = {
  executionCostUsd: 3.17, diagnosticCostUsd: 0.06,
  promptCacheStats: { staticPrefixBytes: 8400, cacheHit: true },
  hasAnyCostData: true,
};

const costNoCache: DashboardCostSection = {
  executionCostUsd: null, diagnosticCostUsd: null,
  promptCacheStats: null,
  hasAnyCostData: false,
};

test('Orchestration renders nothing when promptCacheStats is null', () => {
  const html = renderToStaticMarkup(<Orchestration cost={costNoCache} />);
  assert.equal(html, '');
});

test('Orchestration renders cache prefix size when stats present', () => {
  const html = renderToStaticMarkup(<Orchestration cost={costWithCache} />);
  assert.ok(html.includes('8.2 KB'), 'should format 8400 bytes as 8.2 KB');
});

test('Orchestration shows cache hit indicator', () => {
  const html = renderToStaticMarkup(<Orchestration cost={costWithCache} />);
  assert.ok(html.includes('cache hit'));
});

test('Orchestration shows cache miss when cacheHit is false', () => {
  const html = renderToStaticMarkup(
    <Orchestration cost={{ ...costWithCache, promptCacheStats: { staticPrefixBytes: 5000, cacheHit: false } }} />
  );
  assert.ok(html.includes('cache miss'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/orchestration.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/webview-ui/components/orchestration/Orchestration.tsx`**

```tsx
import React from 'react';
import type { DashboardCostSection } from '../../../webview/dashboardSnapshot';
import { Card } from '../primitives/Card';
import { HealthCell } from '../hero/HealthCell';
import { formatBytes } from '../primitives/Card';

interface OrchestrationProps {
  cost: DashboardCostSection;
}

export function Orchestration({ cost }: OrchestrationProps) {
  if (!cost.promptCacheStats) return null;
  const stats = cost.promptCacheStats;
  const cacheHitLabel =
    stats.cacheHit === null ? 'no cache data' :
    stats.cacheHit ? 'cache hit' : 'cache miss';

  return (
    <Card title="Orchestration · Cache">
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        border: '1px solid var(--rdx-border)', borderRadius: 6,
        overflow: 'hidden', background: 'var(--rdx-surface-2)',
      }}>
        <HealthCell
          label="Prompt prefix"
          value={formatBytes(stats.staticPrefixBytes)}
          sub="static context size"
        />
        <HealthCell
          label="Last call"
          value={cacheHitLabel}
          sub="provider cache status"
          tone={stats.cacheHit === true ? 'ok' : stats.cacheHit === false ? 'neutral' : 'neutral'}
        />
      </div>
      {/* Policy rules, model routing, raw log: deferred — no backing data in state */}
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/orchestration.test.js
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/webview-ui/components/orchestration/Orchestration.tsx test/ui/orchestration.test.tsx
git commit -m "feat(webview): add Orchestration cache stats panel"
```

---

## Task 12: App.tsx — mode state management

**Files:**
- Modify: `src/webview-ui/App.tsx`

- [ ] **Step 1: Update `App.tsx` to manage `DashboardMode` and `onOpenArtifact`**

Replace the contents of `src/webview-ui/App.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { RalphDashboardState, RalphWebviewMessage } from '../ui/uiTypes';
import { DashboardShell } from './components/DashboardShell';
import { SidebarShell } from './components/SidebarShell';
import { vscodeApi } from './bridge/vscode';
import { getWebviewUiModel } from './viewModel';
import type { DashboardMode } from './viewModel';

export type WebviewUiMode = 'dashboard' | 'sidebar';

interface AppProps {
  mode: WebviewUiMode;
  initialState: RalphDashboardState;
}

export function App({ mode, initialState }: AppProps) {
  const [state, setState] = useState(initialState);
  const model = useMemo(() => getWebviewUiModel(state), [state]);

  const [dashboardMode, setDashboardMode] = useState<DashboardMode>(() => {
    const saved = vscodeApi().getState() as { dashboardMode?: DashboardMode } | undefined;
    return saved?.dashboardMode ?? 'standard';
  });

  const handleModeChange = (m: DashboardMode) => {
    setDashboardMode(m);
    const existing = vscodeApi().getState() as Record<string, unknown> | undefined ?? {};
    vscodeApi().setState({ ...existing, dashboardMode: m });
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent<RalphWebviewMessage>) => {
      const message = event.data;
      if (message.type === 'state') {
        setState(message.state);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const sendCommand = (command: string) => {
    vscodeApi().postMessage({ type: 'command', command });
  };
  const sendSettingUpdate = (key: string, value: unknown) => {
    vscodeApi().postMessage({ type: 'update-setting', key, value });
  };
  const sendOpenArtifact = (artifactDir: string) => {
    vscodeApi().postMessage({ type: 'open-iteration-artifact', artifactDir });
  };

  if (mode === 'sidebar') {
    return (
      <SidebarShell
        state={state} model={model}
        mode={dashboardMode} onModeChange={handleModeChange}
        onCommand={sendCommand} onSettingUpdate={sendSettingUpdate}
        onOpenArtifact={sendOpenArtifact}
      />
    );
  }

  return (
    <DashboardShell
      state={state} model={model}
      mode={dashboardMode} onModeChange={handleModeChange}
      onCommand={sendCommand} onSettingUpdate={sendSettingUpdate}
      onOpenArtifact={sendOpenArtifact}
    />
  );
}
```

- [ ] **Step 2: Verify typecheck passes (shells don't exist yet — expected errors)**

```bash
npm run typecheck:webview 2>&1 | head -20
```

Expected: errors about missing exports on SidebarShell and DashboardShell — that is correct; they'll be fixed in Tasks 13 and 14.

- [ ] **Step 3: Commit**

```bash
git add src/webview-ui/App.tsx
git commit -m "feat(webview): add DashboardMode state management in App"
```

---

## Task 13: New SidebarShell

**Files:**
- Modify: `src/webview-ui/components/SidebarShell.tsx` (full rewrite)

The new SidebarShell renders the 220px left nav (mode toggle + tabs + current task card) alongside a main content area that renders the active tab's content.

- [ ] **Step 1: Replace `src/webview-ui/components/SidebarShell.tsx`**

```tsx
import React, { useState } from 'react';
import type { RalphDashboardState } from '../../ui/uiTypes';
import type { WebviewUiModel, DashboardMode } from '../viewModel';
import type { DiagnosisSection } from '../../webview/dashboardSnapshot';
import { HealthPulse, Icon } from './primitives/Card';
import { HeroNow } from './hero/HeroNow';
import { AgentLanes } from './panels/AgentLanes';
import { Timeline } from './panels/Timeline';
import { FailurePanel } from './panels/FailurePanel';
import { DiagnosticsPanel } from './panels/DiagnosticsPanel';
import { TaskPanel } from './tasks/TaskPanel';
import { Orchestration } from './orchestration/Orchestration';
import { SettingsPanel } from './SettingsPanel';

interface SidebarShellProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
  mode: DashboardMode;
  onModeChange: (mode: DashboardMode) => void;
  onCommand: (command: string) => void;
  onSettingUpdate: (key: string, value: unknown) => void;
  onOpenArtifact: (artifactDir: string) => void;
}

type TabId = 'overview' | 'tasks' | 'diagnostics' | 'orchestration' | 'settings';

interface TabDef { id: TabId; label: string; icon: React.ReactNode }

function tabsForMode(mode: DashboardMode): TabDef[] {
  const base: TabDef[] = [
    { id: 'overview',     label: 'Overview',     icon: Icon.bolt  },
    { id: 'tasks',        label: 'Tasks',        icon: Icon.graph },
  ];
  if (mode === 'standard' || mode === 'advanced') {
    base.push({ id: 'diagnostics', label: 'Diagnostics', icon: Icon.warn });
  }
  if (mode === 'advanced') {
    base.push({ id: 'orchestration', label: 'Orchestration', icon: Icon.cog });
  }
  base.push({ id: 'settings', label: 'Settings', icon: Icon.cog });
  return base;
}

const MODES: { id: DashboardMode; label: string; sub: string }[] = [
  { id: 'simple',   label: 'Simple',   sub: 'one-task' },
  { id: 'standard', label: 'Standard', sub: 'balanced' },
  { id: 'advanced', label: 'Advanced', sub: 'full detail' },
];

export function SidebarShell({ state, model, mode, onModeChange, onCommand, onSettingUpdate, onOpenArtifact }: SidebarShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const tabs = tabsForMode(mode);
  const snapshot = state.dashboardSnapshot;
  const diagnosis: DiagnosisSection | null = snapshot?.diagnosis ?? null;

  const onStartLoop    = () => onCommand('ralphCodex.runRalphLoop');
  const onStopLoop     = () => onCommand('ralphCodex.stopLoop');
  const onRunIteration = () => onCommand('ralphCodex.runIteration');
  const onOpenFailure  = (path: string) => onOpenArtifact(path);

  const content = (() => {
    if (activeTab === 'overview') {
      return (
        <>
          <HeroNow state={state} model={model} mode={mode}
            onStartLoop={onStartLoop} onStopLoop={onStopLoop} onRunIteration={onRunIteration} />
          {diagnosis && <FailurePanel diagnosis={diagnosis} onOpenArtifact={onOpenFailure} />}
          {mode === 'simple' ? (
            <Timeline iterations={state.recentIterations} onOpenArtifact={onOpenArtifact} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              <AgentLanes lanes={state.agentLanes} />
              <Timeline iterations={state.recentIterations} onOpenArtifact={onOpenArtifact} />
            </div>
          )}
        </>
      );
    }
    if (activeTab === 'tasks') {
      return <TaskPanel tasks={state.tasks} />;
    }
    if (activeTab === 'diagnostics') {
      return <DiagnosticsPanel diagnostics={state.diagnostics} />;
    }
    if (activeTab === 'orchestration' && snapshot?.cost) {
      return <Orchestration cost={snapshot.cost} />;
    }
    if (activeTab === 'settings') {
      return <SettingsPanel settingsSurface={state.settingsSurface} onSettingUpdate={onSettingUpdate} />;
    }
    return null;
  })();

  return (
    <div className="rdx-shell">
      {/* Left nav */}
      <nav className="rdx-shell-nav">
        {/* Workspace header */}
        <div style={{ padding: '10px 12px 10px', borderBottom: '1px solid var(--rdx-border)' }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--rdx-dim)', fontWeight: 600, marginBottom: 4 }}>
            Ralphdex
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <HealthPulse state={state.loopState} />
            <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state.workspaceName}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--rdx-dim)', marginTop: 1, fontFamily: 'var(--rdx-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {state.agentRole}
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ padding: '8px 10px' }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--rdx-dim)', fontWeight: 700, margin: '4px 2px 6px' }}>
            Mode
          </div>
          <div style={{ display: 'grid', gap: 3, padding: 3, background: 'var(--rdx-surface)', borderRadius: 5, border: '1px solid var(--rdx-border)' }}>
            {MODES.map(m => {
              const active = mode === m.id;
              return (
                <button key={m.id} onClick={() => onModeChange(m.id)} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 8px', borderRadius: 4, fontFamily: 'inherit',
                  background: active ? 'var(--rdx-accent)' : 'transparent',
                  color: active ? 'var(--rdx-primary-fg)' : 'var(--rdx-fg)',
                  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
                }}>
                  <span>{m.label}</span>
                  <span style={{ fontSize: 10, opacity: 0.7 }}>{m.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab nav */}
        <nav style={{ padding: '0 6px', display: 'grid', gap: 2 }}>
          {tabs.map(t => {
            const active = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '7px 10px', borderRadius: 4, fontFamily: 'inherit', fontSize: 12,
                background: active ? 'color-mix(in srgb, var(--rdx-accent) 14%, transparent)' : 'transparent',
                color: active ? 'var(--rdx-fg)' : 'var(--rdx-dim)',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                fontWeight: active ? 600 : 400,
                borderLeft: active ? '2px solid var(--rdx-accent)' : '2px solid transparent',
              }}>
                <span style={{ color: active ? 'var(--rdx-accent)' : 'var(--rdx-dim)', display: 'flex' }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Current task sticky card */}
        {model.currentTask && (
          <div style={{ margin: '8px 10px', padding: 10, background: 'var(--rdx-surface)', borderRadius: 6, border: '1px solid var(--rdx-border)' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--rdx-dim)', fontWeight: 700, marginBottom: 5 }}>
              Current task
            </div>
            <div style={{ fontFamily: 'var(--rdx-mono)', fontSize: 11, color: 'var(--rdx-accent)', marginBottom: 3 }}>
              {model.currentTask.id}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--rdx-fg)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
              {model.currentTask.title}
            </div>
          </div>
        )}
      </nav>

      {/* Main content */}
      <main className="rdx-shell-main">
        <div className="rdx-tab-content">
          {content}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck to verify no errors**

```bash
npm run typecheck:webview
```

Expected: exits 0, no errors (assuming DashboardShell is updated in Task 14).

> If typecheck fails only on DashboardShell imports, proceed to Task 14 first, then re-run.

- [ ] **Step 3: Run full test suite**

```bash
npm run validate
```

Expected: compile + lint + tests all pass.

- [ ] **Step 4: Commit**

```bash
git add src/webview-ui/components/SidebarShell.tsx
git commit -m "feat(webview): rewrite SidebarShell with tabbed nav and mode toggle"
```

---

## Task 14: New DashboardShell

**Files:**
- Modify: `src/webview-ui/components/DashboardShell.tsx` (full rewrite)

The DashboardShell renders a horizontal tab bar at the top and full-width content below. No internal left nav — it's used in the editor panel context where the VS Code window provides the outer shell.

- [ ] **Step 1: Replace `src/webview-ui/components/DashboardShell.tsx`**

```tsx
import React, { useState } from 'react';
import type { RalphDashboardState } from '../../ui/uiTypes';
import type { WebviewUiModel, DashboardMode } from '../viewModel';
import type { DiagnosisSection } from '../../webview/dashboardSnapshot';
import { HealthPulse, Icon, Btn } from './primitives/Card';
import { HeroNow } from './hero/HeroNow';
import { AgentLanes } from './panels/AgentLanes';
import { Timeline } from './panels/Timeline';
import { FailurePanel } from './panels/FailurePanel';
import { DiagnosticsPanel } from './panels/DiagnosticsPanel';
import { TaskPanel } from './tasks/TaskPanel';
import { Orchestration } from './orchestration/Orchestration';
import { SettingsPanel } from './SettingsPanel';

interface DashboardShellProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
  mode: DashboardMode;
  onModeChange: (mode: DashboardMode) => void;
  onCommand: (command: string) => void;
  onSettingUpdate: (key: string, value: unknown) => void;
  onOpenArtifact: (artifactDir: string) => void;
}

type TabId = 'overview' | 'tasks' | 'diagnostics' | 'orchestration' | 'settings';

function tabsForMode(mode: DashboardMode): { id: TabId; label: string }[] {
  const base: { id: TabId; label: string }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'tasks',     label: 'Tasks' },
  ];
  if (mode === 'standard' || mode === 'advanced') {
    base.push({ id: 'diagnostics', label: 'Diagnostics' });
  }
  if (mode === 'advanced') {
    base.push({ id: 'orchestration', label: 'Orchestration' });
  }
  base.push({ id: 'settings', label: 'Settings' });
  return base;
}

const MODES: { id: DashboardMode; label: string }[] = [
  { id: 'simple',   label: 'Simple' },
  { id: 'standard', label: 'Standard' },
  { id: 'advanced', label: 'Advanced' },
];

export function DashboardShell({ state, model, mode, onModeChange, onCommand, onSettingUpdate, onOpenArtifact }: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const tabs = tabsForMode(mode);
  const snapshot = state.dashboardSnapshot;
  const diagnosis: DiagnosisSection | null = snapshot?.diagnosis ?? null;

  const onStartLoop    = () => onCommand('ralphCodex.runRalphLoop');
  const onStopLoop     = () => onCommand('ralphCodex.stopLoop');
  const onRunIteration = () => onCommand('ralphCodex.runIteration');

  const content = (() => {
    if (activeTab === 'overview') {
      return (
        <>
          <HeroNow state={state} model={model} mode={mode}
            onStartLoop={onStartLoop} onStopLoop={onStopLoop} onRunIteration={onRunIteration} />
          {diagnosis && <FailurePanel diagnosis={diagnosis} onOpenArtifact={onOpenArtifact} />}
          {mode === 'simple' ? (
            <Timeline iterations={state.recentIterations} onOpenArtifact={onOpenArtifact} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
              <AgentLanes lanes={state.agentLanes} />
              <Timeline iterations={state.recentIterations} onOpenArtifact={onOpenArtifact} />
            </div>
          )}
        </>
      );
    }
    if (activeTab === 'tasks') {
      return <TaskPanel tasks={state.tasks} />;
    }
    if (activeTab === 'diagnostics') {
      return <DiagnosticsPanel diagnostics={state.diagnostics} />;
    }
    if (activeTab === 'orchestration' && snapshot?.cost) {
      return <Orchestration cost={snapshot.cost} />;
    }
    if (activeTab === 'settings') {
      return <SettingsPanel settingsSurface={state.settingsSurface} onSettingUpdate={onSettingUpdate} />;
    }
    return null;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--rdx-surface)', color: 'var(--rdx-fg)', fontFamily: 'var(--rdx-font)' }}>
      {/* Tab bar */}
      <div className="rdx-tab-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', borderRight: '1px solid var(--rdx-border)', flexShrink: 0 }}>
          <HealthPulse state={state.loopState} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--rdx-fg)' }}>{state.workspaceName}</span>
        </div>
        {tabs.map(t => {
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: '0 16px', height: '100%', minHeight: 36,
              background: active ? 'var(--rdx-surface)' : 'transparent',
              color: active ? 'var(--rdx-fg)' : 'var(--rdx-dim)',
              border: 'none', borderBottom: active ? '2px solid var(--rdx-accent)' : '2px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
              fontWeight: active ? 600 : 400,
            }}>
              {t.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {/* Mode toggle in tab bar */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '0 10px' }}>
          {MODES.map(m => {
            const active = mode === m.id;
            return (
              <button key={m.id} onClick={() => onModeChange(m.id)} style={{
                padding: '3px 10px', fontSize: 11, fontFamily: 'inherit',
                background: active ? 'color-mix(in srgb, var(--rdx-accent) 15%, var(--rdx-surface-2))' : 'transparent',
                border: `1px solid ${active ? 'var(--rdx-accent)' : 'transparent'}`,
                borderRadius: 999, color: active ? 'var(--rdx-accent)' : 'var(--rdx-dim)',
                cursor: 'pointer',
              }}>
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="rdx-tab-content">
        {content}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck:webview
```

Expected: exits 0, no errors.

- [ ] **Step 3: Build the webview bundle**

```bash
npm run build:webview
```

Expected: exits 0, `out/webview-ui/main.js` and `out/webview-ui/main.css` updated.

- [ ] **Step 4: Run full validation**

```bash
npm run validate
```

Expected: all steps pass.

- [ ] **Step 5: Commit**

```bash
git add src/webview-ui/components/DashboardShell.tsx
git commit -m "feat(webview): rewrite DashboardShell with full-width tab bar layout"
```

---

## Task 15: Remove tree view registrations

**Files:**
- Modify: `package.json`
- Modify: `src/extension.ts`

The `ralphCodex.tasks` and `ralphCodex.logs` tree views are replaced by the Task and Diagnostics tabs in the new shell. The `taskTreeView.ts` provider file is preserved but unregistered.

- [ ] **Step 1: Remove tree views from `package.json`**

In `package.json`, find the `"views"` section under `"contributes"` and remove the two tree view entries, leaving only the dashboard webview:

```json
"views": {
  "ralphCodex": [
    {
      "type": "webview",
      "id": "ralphCodex.dashboard",
      "name": "Dashboard"
    }
  ]
}
```

- [ ] **Step 2: Remove the `taskTreeView` registration from `src/extension.ts`**

Find the line in `src/extension.ts` that calls `vscode.window.registerTreeDataProvider('ralphCodex.tasks', ...)` (or similar) and delete it along with any variable declarations that become unused. Do not delete `src/ui/taskTreeView.ts`.

- [ ] **Step 3: Run full validation**

```bash
npm run validate
```

Expected: exits 0. If any TypeScript errors arise from the unused import of `taskTreeView.ts`, also remove the import from `extension.ts`.

- [ ] **Step 4: Commit**

```bash
git add package.json src/extension.ts
git commit -m "feat: remove Tasks and Logs tree views — replaced by new dashboard tabs"
```

---

## Task 16: Final validation gate

- [ ] **Step 1: Run full validate**

```bash
npm run validate
```

Expected: exits 0 across all steps: compile → check:docs → check:ledger → check:prompt-budget → lint → test.

- [ ] **Step 2: Run UI fixture harness**

```bash
npm run test:ui-harness
```

Expected: passes. If any snapshot HTML tests fail due to shell structure changes, update the fixture baselines:

```bash
npm run evidence:ui-fixtures
```

Then re-run:

```bash
npm run test:ui-harness
```

- [ ] **Step 3: Commit any fixture baseline updates**

```bash
git add .ralph/artifacts/ui-fixtures
git commit -m "test: update UI fixture baselines for new shell layout"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Activity bar sidebar — new tabbed design | Task 13 |
| Editor panel — full-width with tab bar | Task 14 |
| Remove ralphCodex.tasks + ralphCodex.logs | Task 15 |
| DashboardMode (simple/standard/advanced) | Task 12 + 13 + 14 |
| CSS design tokens | Task 1 |
| Primitives (Card, Btn, StatusPill, HealthPulse, Icon) | Task 2 |
| PhaseTracker (7 phases) | Task 3 |
| HealthCell | Task 4 |
| HeroNow with health strip | Task 5 |
| Agent Lanes (role color from agentId) | Task 6 |
| Timeline (classification colors, artifact click) | Task 7 |
| Failure Panel (open-artifact button conditionally shown) | Task 8 |
| Diagnostics Panel | Task 9 |
| Task Panel (active/done, expandable) | Task 10 |
| Orchestration (cache stats only, hidden when null) | Task 11 |
| Cache cell shows prefix bytes + hit/miss | Task 5 (HealthCell in HeroNow) |
| Settings tab re-uses existing SettingsPanel | Task 13 + 14 (imported as-is) |
| Deferred features are commented/hidden not deleted | Tasks 8, 10, 11 (inline comments) |
| TSX test infrastructure | Task 0 |
| formatBytes utility | Task 2 |

All spec requirements covered.

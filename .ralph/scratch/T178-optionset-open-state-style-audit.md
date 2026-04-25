# T178: Optionset Open-State Style Audit

## Scope

- Repository scanned: `src/`, `media/`
- Requested focus: optionset/dropdown open-state background + text colour rules

## Findings

No dedicated `optionset`/`option-set` component or selector exists in this repository.
The only option-set style controls are native HTML `<select>` elements rendered in webviews.

## Governing Rules (Background + Text Colour)

1. Shared baseline for all webview `<select>` controls
- File: `src/webview/styles/shared.css`
- Selector/state: `input, select, textarea` (base state)
- Properties:
  - `background: var(--vscode-input-background);`
  - `color: var(--vscode-input-foreground);`
- Selector/state: `input:focus, select:focus, textarea:focus` (focus state while closed/opening)
- Properties:
  - `outline: 1px solid var(--vscode-focusBorder);`
  - `border-color: var(--vscode-focusBorder);`

2. Runtime copy of the shared baseline (must stay in sync)
- File: `src/webview/styles/index.ts`
- Selector/state: `input,select,textarea` and `input:focus,select:focus,textarea:focus`
- Properties: same token mapping as `shared.css`

3. PRD wizard local override (includes task tier `<select>`)
- File: `src/webview/prdCreationWizardHost.ts`
- Selector/state: `.wizard-main textarea, .wizard-main input, .wizard-main select` (base state)
- Properties:
  - `background: rgba(0, 0, 0, 0.18);`
  - `color: var(--fg);`
  - `border-color: var(--border);`
- Affects dropdown trigger and the tier selector rendered at:
  - `<select data-action="task-tier" ...>`

4. Dashboard settings local override (enum `<select>` controls)
- File: `src/ui/panelHtml.ts`
- Selector/state: `.setting-control select` (base state)
- Properties:
  - `background: rgba(0, 0, 0, 0.2);`
  - `color: var(--vscode-input-foreground, #ccc);`
  - `border: 1px solid var(--border);`
- Selector/state: `.setting-control select:focus`
- Properties:
  - `border-color: var(--accent);`
  - `box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);`
- Select markup source:
  - `function select(...)` returns `<select data-setting="...">...</select>`

## Open-State Specificity Outcome

- No explicit `select:open`, `option { ... }`, listbox popup class, or JS-driven `menu-open` class was found under `src/` or `media/`.
- Therefore, dropdown popup row/background text colours in the open list are controlled by:
  - VS Code/webview theme tokens (where supported),
  - native browser/embedded webview user-agent defaults for `<option>` popup rendering.

## Practical Implication

If white-on-white appears in the open dropdown menu, there is currently no repo-local open-popup selector to patch directly. A fix will require either:
- introducing explicit option/listbox styling strategy supported by the webview engine, or
- adjusting the upstream token values (`--vscode-input-*`) via theme context.

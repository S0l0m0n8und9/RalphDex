# UI Evidence Checklist

Use this checklist for any PR that changes user-facing RalphDex UI (dashboard, sidebar, settings, command placement, labels, or interactions).

## Required Evidence

- Before/after screenshots, or a rendered-state diff, for each changed surface.
- A list of affected fixture IDs from `docs/ui-state-fixtures.md`.
- A short note on command placement or workflow impact (sidebar/dashboard/settings/palette).
- Accessibility notes for keyboard focus, labelling, and contrast where relevant.
- Confirmation that stale UX labels were not reintroduced.

## Acceptable Evidence When Screenshots Are Not Available

- HTML render diff from deterministic fixture tests.
- Explicit fixture list plus changed renderer/test files.
- A brief rationale for why screenshot capture was unavailable in that environment.

## Lightweight Rule

- Copy-only or text-only tweaks can use minimal evidence:
  - one screenshot or one rendered diff
  - affected fixture IDs
  - confirmation no interaction flow changed

## Verification Commands

- `npm run test:ui-harness`
- `npm run validate`


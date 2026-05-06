# UI State Fixture Catalogue

This catalogue defines deterministic dashboard/sidebar render states for UI review and regression checks.

Source of truth: `test/ui/fixtures/uiStateFixtures.ts`.

## Fixture States

- `empty-workspace`: no PRD and no tasks.
- `no-prd`: setup flow required before execution.
- `prd-no-tasks`: PRD exists but task list is empty.
- `provider-not-configured`: provider readiness/credentials not yet valid.
- `provider-ready`: provider settings resolved with normal defaults.
- `idle-with-tasks`: actionable backlog in idle mode.
- `running-single-agent`: one active lane.
- `running-multi-agent`: multiple active lanes.
- `blocked-preflight`: preflight blocks execution with diagnostics.
- `needs-human-review`: latest outcome requires review handoff.
- `repeated-no-progress`: repeated no-progress stop state.
- `failed-iteration`: latest iteration failed.
- `all-tasks-done`: completion summary state.
- `settings-invalid`: inline settings validation errors.
- `task-seeding-success`: seeding success with artifact reference.
- `task-seeding-error`: seeding failure feedback.

## Usage

- Render harness test: `test/ui/uiFixtureHarness.test.ts`.
- Dashboard renderer: `src/ui/panelHtml.ts`.
- Sidebar renderer: `src/ui/sidebarHtml.ts`.
- Visual/a11y harness entrypoint: `npm run test:ui-harness`.

## Notes

- Fixtures are deterministic and do not read live workspace files.
- Add new fixtures when introducing new operator-visible states.
- Keep fixture IDs stable so screenshot/a11y baselines stay comparable over time.


# Prompt Calibration

## Calibration Baseline

The checked-in codex policy matrix in `src/prompt/promptBuilder.ts` is the calibrated baseline. It represents the current hardcoded targets Ralph uses when `promptBudgetProfile = codex`. Each `targetTokens` value represents the desired rendered prompt size, not the model's response budget.

The policy matrix is keyed on `promptKind:promptTarget` (e.g. `iteration:cliExec`). Two targets exist per kind: `cliExec` (scripted) and `ideHandoff` (human-reviewed clipboard handoff). IDE handoff targets are set 30–40 % below the equivalent CLI target because human reviewers benefit from shorter, denser prompts.

Ralph also exposes two alternate profiles:

- `claude`: a separate placeholder matrix with higher token ceilings for Claude's longer context window. Those targets are intentionally provisional and require calibration before production use.
- `custom`: a flat `ralphCodex.customPromptBudget` object keyed by `promptKind:promptTarget` that overrides only `targetTokens` while reusing the codex section-shaping heuristics.

## Token Target Methodology

Token targets were set by **estimating section sizes** rather than by observing real truncation events. The derivation for each policy entry follows a section-budget model:

- **Required sections** (`strategyContext`, `preflightContext`, `objectiveContext`, `taskContext`, `operatingRules`, `executionContract`, `finalResponseContract`) contribute a fixed combined overhead of roughly 500–700 tokens when rendered at their smallest settings.
- **Variable sections** are budgeted from the per-policy character limits. The approximation is 4 characters ≈ 1 token:
  - `objectiveChars` → `objectiveChars / 4` tokens
  - `progressChars` → `progressChars / 4` tokens
  - `priorBudget` → budget is measured in prior-context lines, each estimated at 20–25 tokens
- The `targetTokens` value is the sum of estimated fixed overhead plus the variable section budgets, rounded to the nearest 100 and biased slightly high to avoid truncating the most important sections.

Every current codex policy target in `src/prompt/promptBuilder.ts` was derived with that same estimated-budget method:

| Policy entry | Current target | Derivation method |
|-------------|----------------|-------------------|
| `bootstrap:cliExec` | 2100 | Estimated from expanded objective plus expanded repo/runtime sections; not set from observed truncation. |
| `bootstrap:ideHandoff` | 1500 | Estimated from the CLI bootstrap profile, then reduced for shorter human-reviewed handoff prompts. |
| `iteration:cliExec` | 1600 | Estimated from selected-task context plus minimal repo/runtime sections; not set from observed truncation. |
| `iteration:ideHandoff` | 1000 | Estimated from the CLI iteration profile, then reduced for denser human review. |
| `replenish-backlog:cliExec` | 1800 | Estimated from PRD plus expanded repo/runtime sections for task generation; not set from observed truncation. |
| `replenish-backlog:ideHandoff` | 1300 | Estimated from the CLI replenish-backlog profile, then reduced for manual review. |
| `fix-failure:cliExec` | 1700 | Estimated from failure signature, remediation context, and compact repo/runtime sections; not set from observed truncation. |
| `fix-failure:ideHandoff` | 1100 | Estimated from the CLI fix-failure profile, then reduced for review-oriented prompts. |
| `continue-progress:cliExec` | 1600 | Estimated from selected task, recent progress, and prior iteration context; not set from observed truncation. |
| `continue-progress:ideHandoff` | 1000 | Estimated from the CLI continue-progress profile, then reduced for manual review. |
| `human-review-handoff:cliExec` | 1500 | Estimated from blocker and remediation context; not set from observed truncation. |
| `human-review-handoff:ideHandoff` | 1100 | Estimated from the CLI human-review profile, then reduced for shorter human review. |

The checked-in `claude` profile currently uses placeholder targets only. They are intentionally higher than the codex baseline to reflect a larger context window, but they have not been empirically calibrated and must not be treated as production-tuned values until the recalibration procedure below is run against real Claude prompt measurements.

**Worked example — `iteration:cliExec`:** fixed overhead ≈ 600, objectiveChars 960/4 = 240, progressChars 420/4 = 105, priorBudget 5 lines × 22 ≈ 110, repoContext minimal ≈ 60, runtimeContext minimal ≈ 60. Sum ≈ 1175; rounded up to **1600** with a conservative buffer for task-context variance.

No systematic truncation experiments were run at calibration time. If prompts are being truncated in practice, follow the recalibration procedure below.

## Recalibration Procedure

Follow these steps when switching to a different model, after a Codex CLI context-window change, or after observing consistent prompt truncation or unnecessary padding.

1. **Record the new context window.** Find the model's maximum context tokens from its documentation. If the new model becomes the checked-in default, update `src/config/defaults.ts` and the "Calibration Baseline" section of this file together.

2. **Measure the fixed-section floor.** Render three representative prompts (bootstrap, iteration, replenish-backlog) at their current settings with a minimal task and minimal repo context. Record the actual token count from the CLI's usage output. The lowest count is the fixed-section floor.

3. **Measure variable-section sizes.** For a realistic task and repo, render each prompt kind and measure the token count above the floor. Divide by the character limits to get an empirical chars-per-token ratio. Claude models are typically 3.5–4.5 chars/token for English prose; adjust the approximation in this doc if measurement diverges.

4. **Re-derive each policy entry.** For each `promptKind:promptTarget`, recompute `floor + variableBudget + 15 % buffer`, then round to the nearest 100. Keep IDE handoff targets 30–40 % below their CLI equivalents unless testing shows a different review density is better.

5. **Adjust character limits if needed.** If the new model has a larger context window and you want to allow richer context, increase `objectiveChars`, `progressChars`, and `priorBudget` proportionally in `src/prompt/promptBuilder.ts`, then re-derive `targetTokens`. If the new model has a smaller context window, reduce those section budgets first and only then set lower token targets.

6. **Smoke-test real prompts.** Run one representative prompt for each CLI kind and inspect the resulting prompt artifacts or CLI usage output for truncation, omitted sections, or obvious over-padding. If real truncation occurs, prefer lowering section budgets before lowering only one `targetTokens` value.

7. **Run `npm run check:docs` and `npm run validate`.** Confirm the documentation still matches the code and the updated policy matrix compiles and passes tests.

8. **Update this file** with the active profile baseline, the model name and context window used for calibration, the empirical chars-per-token ratio measured in step 3, and whether the recalibration was estimate-only or also informed by observed truncation behavior.

## Reasoning Effort Overhead

`ralphCodex.reasoningEffort` controls the reasoning setting passed to the scripted CLI backend. For the current default baseline, that means the configured model can spend extra internal reasoning tokens before producing its visible response. The setting does not change rendered prompt size; it changes total iteration token burn and latency.

| Value | Use case | Expected reasoning token overhead | Relative prompt overhead |
|-------|----------|-----------------------------------|--------------------------|
| `medium` | Default for normal task iterations | ~5 000–8 000 tokens | Roughly +3x to +5x prompt-budget overhead relative to a 1600-token iteration prompt |
| `high` | Architecture design, hard debugging, remediation-heavy tasks | ~10 000–16 000 tokens | Roughly +6x to +10x prompt-budget overhead relative to a 1600-token iteration prompt |

**Operator guidance:** The `targetTokens` values in the policy matrix represent only the input prompt. When estimating total token spend per iteration, add the reasoning overhead for the configured effort level plus the expected response length (typically 500–1 500 tokens for a focused task iteration). At `medium` effort a typical iteration consumes roughly 7 000–11 000 tokens total; at `high` effort, 13 000–19 000 tokens.

When switching to a model or CLI backend that does not support extended thinking, set `reasoningEffort` to `medium` or remove the extra reasoning control from the active provider path, then re-run the recalibration procedure. The prompt targets can stay estimate-based, but the total iteration budget and latency expectations in this section must be re-derived for that backend.

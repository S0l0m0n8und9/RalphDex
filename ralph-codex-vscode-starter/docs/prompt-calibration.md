# Prompt Calibration

## Calibration Baseline

The policy matrix in `src/prompt/promptBuilder.ts` was calibrated against **claude-sonnet-4-6** (200 000-token context window). Each `targetTokens` value represents the desired rendered prompt size, not the model's response budget.

The policy matrix is keyed on `promptKind:promptTarget` (e.g. `iteration:cliExec`). Two targets exist per kind: `cliExec` (scripted) and `ideHandoff` (human-reviewed clipboard handoff). IDE handoff targets are set 30–40 % below the equivalent CLI target because human reviewers benefit from shorter, denser prompts.

## Token Target Methodology

Token targets were set by **estimating section sizes** rather than by observing real truncation events. The derivation for each policy entry follows a section-budget model:

- **Required sections** (`strategyContext`, `preflightContext`, `objectiveContext`, `taskContext`, `operatingRules`, `executionContract`, `finalResponseContract`) contribute a fixed combined overhead of roughly 500–700 tokens when rendered at their smallest settings.
- **Variable sections** are budgeted from the per-policy character limits. The approximation is 4 characters ≈ 1 token:
  - `objectiveChars` → `objectiveChars / 4` tokens
  - `progressChars` → `progressChars / 4` tokens
  - `priorBudget` → budget is measured in prior-context lines, each estimated at 20–25 tokens
- The `targetTokens` value is the sum of estimated fixed overhead plus the variable section budgets, rounded to the nearest 100 and biased slightly high to avoid truncating the most important sections.

**Example — `iteration:cliExec`:** fixed overhead ≈ 600, objectiveChars 960/4 = 240, progressChars 420/4 = 105, priorBudget 5 lines × 22 ≈ 110, repoContext minimal ≈ 60, runtimeContext minimal ≈ 60. Sum ≈ 1175; rounded up to **1600** with a conservative buffer for task-context variance.

No systematic truncation experiments were run at calibration time. If prompts are being truncated in practice, follow the recalibration procedure below.

## Recalibration Procedure

Follow these steps when switching to a different model, after a Codex CLI context-window change, or after observing consistent prompt truncation or unnecessary padding.

1. **Record the new context window.** Find the model's maximum context tokens from its documentation. Update the "Calibration Baseline" section of this file.

2. **Measure the fixed-section floor.** Render three representative prompts (bootstrap, iteration, replenish-backlog) at their current settings with a minimal task and minimal repo context. Record the actual token count from the CLI's usage output. The lowest count is the fixed-section floor.

3. **Measure variable-section sizes.** For a realistic task and repo, render each prompt kind and measure the token count above the floor. Divide by the character limits to get an empirical chars-per-token ratio. Claude models are typically 3.5–4.5 chars/token for English prose; adjust the approximation in this doc if measurement diverges.

4. **Set new `targetTokens` values.** For each policy entry: `targetTokens = floor + variableBudget + 15 % buffer`. The 15 % buffer absorbs task-context variance. Keep IDE handoff targets 30–40 % below CLI targets.

5. **Adjust character limits if needed.** If the new model has a larger context window and you want to allow richer context, increase `objectiveChars`, `progressChars`, and `priorBudget` proportionally in `src/prompt/promptBuilder.ts`, then re-derive `targetTokens`.

6. **Run `npm run validate`** and confirm prompts render without truncation warnings under the new targets.

7. **Update this file** with the new baseline model name, context window size, and the empirical chars-per-token ratio measured in step 3.

## Reasoning Effort Overhead

`ralphCodex.reasoningEffort` controls the `--reasoning-effort` flag passed to the Claude CLI for scripted runs. The setting does not affect the rendered prompt size — it affects the number of reasoning (thinking) tokens the model may use before producing its visible response.

| Value | Use case | Expected reasoning token overhead |
|-------|----------|-----------------------------------|
| `medium` | Default for normal task iterations | ~5 000–8 000 tokens |
| `high` | Architecture design, hard debugging, remediation-heavy tasks | ~10 000–16 000 tokens |

**Operator guidance:** The `targetTokens` values in the policy matrix represent only the input prompt. When estimating total token spend per iteration, add the reasoning overhead for the configured effort level plus the expected response length (typically 500–1 500 tokens for a focused task iteration). At `medium` effort a typical iteration consumes roughly 7 000–11 000 tokens total; at `high` effort, 13 000–19 000 tokens.

When switching to a model that does not support extended thinking, set `reasoningEffort` to `medium` (or remove the flag from the CLI invocation in `src/codex/claudeCliProvider.ts`) and re-run the recalibration procedure, since response latency and token-burn characteristics will differ.

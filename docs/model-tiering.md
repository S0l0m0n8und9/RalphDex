# Model Tiering

Ralph routes each task to a model tier based on a deterministic complexity score. Simple tasks use the configured simple-tier provider/model pair, while complex tasks use a more capable tier. This keeps capability allocation proportional to task difficulty.

## Enabling Model Tiering

Model tiering is enabled by default (`ralphCodex.modelTiering.enabled: true`). The legacy convenience flag `ralphCodex.enableModelTiering` is also supported and overrides the nested `enabled` field when explicitly set.

Set tiering to `false` to fall back to the single model configured in `ralphCodex.model` for all tasks.

## Scoring Signals

The complexity scorer (`src/ralph/complexityScorer.ts`) assigns integer points using observable, evidence-backed signals only — no freeform AI inference:

| Signal | Points | Rationale |
|---|---|---|
| `has_validation_field` | +2 | Task declares an explicit validation command, indicating a verifiable contract |
| `child_task_count` | +1 per child, capped at +3 | More children indicate broader scope |
| `has_blocker_note` | +1 | Task has a known blocker, suggesting prior difficulty |
| `trailing_complex_classifications` | +1 per trailing blocked/failed/needs_human_review iteration, capped at +4 | Repeated failures signal genuine complexity |
| `title_word_count` | ±1 | Very short titles (≤2 words) suggest trivial scope; very long titles (≥13 words) suggest broader scope |

The total score is the sum of all contributing signals.

## Tier Thresholds

Scores map to tiers using two thresholds in `ralphCodex.modelTiering` (`simpleThreshold` and `complexThreshold`):

Historical note: some older docs and settings discussions refer to these thresholds as `ralphCodex.complexityTierThresholds`; the active shipped surface is the nested `ralphCodex.modelTiering` object.

| Score range | Tier | Default model |
|---|---|---|
| `score < simpleThreshold` (default: 2) | simple | `provider: copilot`, `model: claude-opus-4-6` |
| `simpleThreshold ≤ score < complexThreshold` | medium | `claude-sonnet-4-6` |
| `score ≥ complexThreshold` (default: 6) | complex | `claude-opus-4-6` |

Override the thresholds by setting `simpleThreshold` and `complexThreshold` in `ralphCodex.modelTiering`:

```json
"ralphCodex.modelTiering": {
  "simpleThreshold": 3,
  "complexThreshold": 7
}
```

## Model And Provider Configuration

Each tier can specify a `model` string and an optional `provider` override:

```json
"ralphCodex.modelTiering": {
  "enabled": true,
  "simple":  { "provider": "copilot", "model": "claude-opus-4-6" },
  "medium":  { "provider": "claude", "model": "claude-sonnet-4-6" },
  "complex": { "provider": "claude", "model": "claude-opus-4-6" },
  "simpleThreshold": 2,
  "complexThreshold": 6
}
```

Omitting `provider` uses the workspace default (`ralphCodex.cliProvider`). Set `provider` to route a specific tier through a different CLI provider (e.g. `"copilot"` for simple tasks, `"claude"` for complex).

Source of truth for shipped defaults is `package.json` (`contributes.configuration.properties.ralphCodex.modelTiering`).

## Expected Cost Savings

Most tasks in a healthy backlog are simple or medium: a single, bounded objective with no prior failure history and no child tasks. At default thresholds, tasks that score below `simpleThreshold` route to the simple tier's configured target. Tasks that genuinely need the complex tier should accumulate multiple signals (validation + children + trailing failures), keeping escalations evidence-driven.

Operators can inspect the selected tier and score for each iteration in the artifact provenance bundle (`verifier-summary.json`).

## Prompt Caching And Azure AI Foundry

Prompt caching is available on Azure AI Foundry deployments that use Anthropic-compatible model endpoints (Claude Haiku, Sonnet, and Opus model families). Other Azure-hosted models (OpenAI-compatible or Azure OpenAI Service) do not support the `cache_control` field; those deployments must rely on Azure OpenAI Service's own native caching mechanisms.

### CLI vs direct-API caching

| Strategy | Caching mechanism |
|---|---|
| CLI-based (`codex`, `claude`, `copilot`) | Implicit — the CLI provider manages caching internally; Ralph sends no `cache_control` field |
| Azure AI Foundry direct-HTTPS (`azureFoundry`) | Explicit — Ralph inserts a `cache_control: ephemeral` breakpoint at the static-prefix boundary |

Setting `ralphCodex.promptCaching` to `auto` (the default) means Ralph applies `cache_control` only when the active provider supports explicit caching markers. CLI-based providers are silently unaffected and continue to use whatever implicit caching their underlying CLI tool provides. See [docs/prompt-calibration.md](prompt-calibration.md#prompt-caching) for the full `promptCaching` setting reference and per-iteration cost implications.

### Verifying cache hits via Azure Monitor

Each Azure AI Foundry response includes usage fields that indicate whether the prompt prefix was served from cache:

| Response field | Meaning |
|---|---|
| `cache_creation_input_tokens` | Tokens written to cache on this request (miss — charged at the creation rate) |
| `cache_read_input_tokens` | Tokens read from cache on this request (hit — charged at the reduced cached rate) |

Ralph records these values as `promptCacheStats.cacheHit` (`true` / `false` / `null`) and `promptCacheStats.staticPrefixBytes` in the iteration provenance bundle.

To monitor cache efficiency in Azure Monitor:

1. Enable diagnostic settings on your Azure AI Foundry resource and route logs to a Log Analytics workspace.
2. Query the `AzureDiagnostics` or `ApiManagementGatewayLogs` table scoped to your deployment.
3. Filter on `cache_read_input_tokens > 0` to identify cache-hit iterations.
4. Compare `cache_read_input_tokens` vs `cache_creation_input_tokens` across iterations to calculate the cache-hit rate and token savings.

A healthy long-running loop shows `cache_read_input_tokens` growing relative to `cache_creation_input_tokens` as the stable prompt prefix stabilises across iterations. If `cache_read_input_tokens` is consistently zero, check that: (a) `ralphCodex.promptCaching` is not `off`, (b) the active provider is an Anthropic-compatible Azure AI Foundry deployment, and (c) the static prefix exceeds the provider's minimum cacheable size threshold.

## Calibration

Corpus date: 2026-04-14. Scored 269 done tasks from `.ralph/tasks.json` using default thresholds (`simpleThreshold=2`, `complexThreshold=6`). Script: `node scripts/calibrate-tiering.js`.

> **Methodology note:** `trailing_complex_classifications` scores 0 for all tasks because iteration history is not persisted in `tasks.json`. All scores are lower-bound estimates — tasks that failed repeatedly at runtime would have scored higher, shifting the medium/complex boundary upward.

### Tier Counts

| Tier | Count | Percentage |
|---|---|---|
| simple | 15 | 5.6% |
| medium | 252 | 93.7% |
| complex | 2 | 0.7% |

### Score Histogram

| Score | Tier | Count |
|---|---|---|
| 0 | simple | 9 |
| 1 | simple | 6 |
| 2 | medium | 138 |
| 3 | medium | 87 |
| 4 | medium | 17 |
| 5 | medium | 10 |
| 6 | complex | 2 |

### Representative Task Examples

**Simple tier** (score 0–1, 15 tasks):

| Task | Score | Dominant signals |
|---|---|---|
| T9: Defer broad multi-agent orchestration… | 1 | `child_task_count(+1)` |
| T21.6.2: Human-approval boundaries | 1 | `has_validation_field(+2)`, `title_word_count(-1)` |
| T24.1.2.1: Claim acquisition | 1 | `has_validation_field(+2)`, `title_word_count(-1)` |

**Medium tier** (score 2–5, 252 tasks):

| Task | Score | Dominant signals |
|---|---|---|
| T8: Align nested inspection-root and execution-root semantics… | 5 | `has_validation_field(+2)`, `child_task_count(+3)` |
| T12: Protect latest-linked artifacts… | 5 | `has_validation_field(+2)`, `child_task_count(+3)` |
| T21: Add a bounded task-remediation pass… | 5 | `has_validation_field(+2)`, `child_task_count(+3)` |

**Complex tier** (score ≥ 6, 2 tasks):

| Task | Score | Dominant signals |
|---|---|---|
| T22: Add token-budgeted prompt and context generation… | 6 | `has_validation_field(+2)`, `child_task_count(+3)`, `title_word_count(+1)` |
| T120: Complete the remaining full webview UI contract… | 6 | `has_validation_field(+2)`, `child_task_count(+3)`, `title_word_count(+1)` |

### Threshold Assessment

The distribution is heavily medium-skewed (93.7%), with only 5.6% simple and 0.7% complex. Two structural factors drive this:

1. **`has_validation_field` is near-universal.** 233 of 269 done tasks (87%) declare an explicit validation command. At +2 points this single signal pushes almost every task past the `simpleThreshold=2` boundary into medium, leaving the simple tier nearly unused in practice.
2. **`trailing_complex_classifications` is absent.** Because iteration history is not stored in `tasks.json`, no task accumulates the +1–+4 that would push it to complex. At runtime, repeatedly-failing tasks would score higher and more tasks would reach the `complexThreshold=6` boundary.

**Implication:** The current `simpleThreshold=2` is strict when nearly all tasks declare a validation field. Raising `simpleThreshold` to 3 would classify validation-only tasks (score = 2) as simple-tier routes under the configured simple-tier provider/model pair. Consider this adjustment if you want broader simple-tier usage. The `complexThreshold=6` appears well-placed: reaching it requires at minimum three coincident signals (e.g., validation + children + long title), reserving the complex tier for genuinely broad tasks. No immediate change to `complexThreshold` is warranted.

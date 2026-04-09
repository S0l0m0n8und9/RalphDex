# Model Tiering

Ralph routes each task to a model tier based on a deterministic complexity score. Simple tasks use a cheaper, faster model; complex tasks use a more capable model. This keeps costs proportional to actual task difficulty.

## Enabling Model Tiering

Model tiering is enabled by default (`ralphCodex.enableModelTiering: true`). Set it to `false` to fall back to the single model configured in `ralphCodex.model` for all tasks.

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

Scores map to tiers using two thresholds (the `ralphCodex.complexityTierThresholds` within `ralphCodex.modelTiering`):

| Score range | Tier | Default model |
|---|---|---|
| `score < simpleThreshold` (default: 2) | simple | `claude-haiku-4-5-20251001` |
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
  "simple":  { "model": "claude-haiku-4-5-20251001" },
  "medium":  { "model": "claude-sonnet-4-6" },
  "complex": { "model": "claude-opus-4-6" },
  "simpleThreshold": 2,
  "complexThreshold": 6
}
```

Omitting `provider` uses the workspace default (`ralphCodex.cliProvider`). Set `provider` to route a specific tier through a different CLI provider (e.g. `"copilot"` for simple tasks, `"claude"` for complex).

## Expected Cost Savings

Most tasks in a healthy backlog are simple or medium: a single, bounded objective with no prior failure history and no child tasks. At default thresholds, those tasks score below 2 and land in the simple tier (Haiku), which is significantly cheaper per token than Sonnet or Opus. Complex tasks that genuinely need Opus will have accumulated multiple signals (validation + children + trailing failures), keeping escalations rare and justified.

Operators can inspect the selected tier and score for each iteration in the artifact provenance bundle (`verifier-summary.json`).

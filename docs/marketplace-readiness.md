# Ralphdex Marketplace Readiness Checklist

This document tracks marketplace-facing readiness for Ralphdex using repository evidence.

**Date reviewed:** 2026-05-04
**Extension ID:** `s0l0m0n8und9.ralphdex`
**Current version:** `1.1.2`
**Target marketplace:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=s0l0m0n8und9.ralphdex)

---

## 1. Evidence Inputs

Reviewed sources:
- `package.json` (`contributes.commands`, `activationEvents`, `scripts`, metadata, capabilities)
- `README.md` command and workflow surfaces
- `.ralph/artifacts/evals/offline-eval-latest.json`
- `.ralph/artifacts/dogfood-evidence/dogfood-evidence-codex-2026-05-04.json`
- `docs/boundaries.md`, `docs/security.md`, `docs/dogfooding-runbook.md`

All findings below are based on those files as of 2026-05-04.

---

## 2. Package Metadata

| Field | Value | Status |
|---|---|---|
| `name` | `ralphdex` | OK |
| `displayName` | `Ralphdex` | OK |
| `description` | `VS Code extension for file-backed Ralphdex prompts, IDE handoff, and CLI exec loops.` | OK |
| `version` | `1.1.2` | OK |
| `publisher` | `s0l0m0n8und9` | OK |
| `homepage` | `https://github.com/S0l0m0n8und9/RalphDex#readme` | OK |
| `bugs.url` | `https://github.com/S0l0m0n8und9/RalphDex/issues` | OK |
| `license` | `MIT` | OK |
| `engines.vscode` | `^1.95.0` | OK |
| `engines.node` | `>=20` | OK |
| `categories` | `AI`, `Other` | OK |
| `icon` | `media/ralph-icon.png` | OK |
| `galleryBanner` | `#111827` / `dark` | OK |

---

## 3. Command Surface Audit

### 3.1 Current Counts

- `package.json` `contributes.commands`: **40** command titles
- `README.md` command bullets under "Current command surface": **39**

### 3.2 Current Delta

Only one package command is missing from the README command list:
- `Ralphdex: Stop Loop`

No extra command bullets were found in README that are absent from `package.json`.

### 3.3 Impact

Impact is low for marketplace listing accuracy, but this is still a documentation mismatch and should be corrected so README remains synchronized with shipped command titles.

---

## 4. Security, Trust, and Boundary Alignment

Current marketplace-facing claims remain aligned with implementation and boundary docs:
- Untrusted workspace behavior is explicitly limited in `package.json` (`capabilities.untrustedWorkspaces.supported: "limited"`).
- `docs/security.md` keeps credential handling in operator-managed runtime secret sources (not literal workspace settings).
- `docs/boundaries.md` keeps trust limits and non-goals explicit.
- `docs/dogfooding-runbook.md` defines redaction expectations and pass/fail criteria for shareable evidence.

No boundary conflicts were found in README or package metadata during this review.

---

## 5. Release Evidence State (Persisted Artifacts)

### 5.1 Offline Eval Artifact

Artifact: `.ralph/artifacts/evals/offline-eval-latest.json`

| Field | Value |
|---|---|
| `ranAt` | `2026-05-04T09:12:50.287Z` |
| `fixturesEvaluated` | `3` |
| `fixturesPassed` | `2` |
| `fixturesFailed` | `1` |
| `overallOutcome` | `fail` |
| `expectationMatches` | `3` |
| `expectationMismatches` | `0` |

Interpretation: the persisted offline evaluation record exists and is internally consistent, but the top-level outcome is currently `fail`.

### 5.2 Dogfood Evidence Artifact

Artifact: `.ralph/artifacts/dogfood-evidence/dogfood-evidence-codex-2026-05-04.json`

| Field | Value |
|---|---|
| `dogfoodRunId` | `dogfood-codex-2026-05-04-001` |
| `provider` | `codex` |
| `model` | `gpt-5.3-codex` |
| `ranAt` | `2026-05-04T09:12:46.289Z` |
| `outcome` | `failed` |
| `validation.verifierCommand.status` | `passed` |
| `validation.repositoryGate.status` | `passed` |
| `summary` | Execution succeeded; verification failed because `gitDiff` reported no relevant workspace changes |
| `redactionApplied` | `true` |

Interpretation: persisted dogfood evidence exists and includes redaction metadata, but this run is not a pass-grade dogfood outcome.

### 5.3 Evidence Readiness Summary

- Evidence persistence: **present**
- Evidence hygiene (redaction metadata): **present**
- Latest offline eval gate: **not green** (`overallOutcome: fail`)
- Latest dogfood run gate: **not green** (`outcome: failed`)

---

## 6. Pre-Publication Checklist

| Item | Status | Notes |
|---|---|---|
| Package metadata complete | OK | Name/version/publisher/license/engines/categorization present |
| Installation docs accurate | OK | Marketplace + VSIX paths documented |
| Command documentation synchronized | ACTION REQUIRED | Add `Ralphdex: Stop Loop` to README command list |
| Trust model declared | OK | `untrustedWorkspaces.supported: "limited"` |
| Privacy/security boundaries documented | OK | `docs/security.md`, `docs/boundaries.md` |
| Release evidence persisted | OK | Offline eval + dogfood files exist |
| Latest offline eval outcome | ACTION REQUIRED | `overallOutcome: fail` |
| Latest dogfood outcome | ACTION REQUIRED | `outcome: failed` |

---

## 7. Required Corrections

1. Update README "Current command surface" to include `Ralphdex: Stop Loop`.
2. Regenerate offline eval evidence until latest artifact outcome is green for the intended release gate.
3. Re-run manual dogfooding per `docs/dogfooding-runbook.md` to produce a pass-grade record for the target release evidence set.

---

## Marketplace Ready?

**Marketplace listing content:** Mostly ready, with one command-list correction still required.

**Release evidence state:** Not fully ready for a strict evidence-backed release gate because the latest persisted offline eval and dogfood records are failed/mixed.


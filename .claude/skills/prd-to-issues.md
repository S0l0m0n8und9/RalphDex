---
name: prd-to-issues
description: Break a PRD into a Kanban board of independently executable GitHub issues. Use when the user says /prd-to-issues, "break this PRD into issues", "create issues from the PRD", or wants to turn a requirements document into a set of actionable tasks.
---

# /prd-to-issues — Breaking Down the Destination into a Journey

Turn a PRD into a set of independently grabbable issues structured as vertical slices.

## Workflow

1. **Locate the PRD** — Find the PRD in the current conversation, the codebase, or fetch it from a GitHub issue URL if provided.
2. **Explore the codebase** — Understand the existing structure so issues are grounded in reality.
3. **Draft vertical slices** — Break the PRD into tasks that cut through all integration layers (not horizontal layers). Each issue should expose unknown unknowns early.
4. **Establish blocking relationships** — Identify which issues block others. Make non-blocked issues clearly independent so they can be picked up in parallel.
5. **Write the issues** — Use the template below. Create GitHub issues if a repo is connected.

## Issue Template

```
## [Issue Title]

**Type:** Feature | Bug | Refactor | Spike

**Summary**
What needs to be done and why.

**Acceptance Criteria**
- [ ] Criterion 1
- [ ] Criterion 2

**Blocked by:** #[issue number] (or "None — can be picked up independently")

**Notes**
Any implementation hints, risks, or context.
```

## Key Principles

- **Vertical slices, not horizontal layers.** Each issue should touch the full stack (data → logic → UI) rather than "do all the DB work" or "do all the UI work". This surfaces integration risk early.
- **Tracer bullet approach.** The first issues should produce something end-to-end, even if thin, so you know the integration works.
- **Independent where possible.** If agents can work in parallel, make non-blocked issues explicitly flagged as safe to pick up simultaneously.
- **Small and focused.** If an issue takes more than a day of focused work to describe, break it down further.

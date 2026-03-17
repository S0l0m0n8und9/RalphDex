---
name: write-a-prd
description: Convert a conversation or idea into a Product Requirements Document (PRD). Use when the user says /write-a-prd, "write a PRD", "create a PRD", or wants to formalise a feature discussion into a requirements document. Works best after /grill-me has been run.
---

# /write-a-prd — From Conversation to Document

Create a Product Requirements Document (PRD) based on our current understanding. Skip steps already completed.

## Workflow

1. **Ask for a description** — If we haven't discussed the feature yet, ask the user for a detailed description.
2. **Explore the repo** — Verify any assertions about the codebase. Understand what already exists.
3. **Interview if needed** — If understanding is still shallow, run a focused interview (see `/grill-me`). Skip this if a thorough interview has already been completed.
4. **Sketch major modules** — Identify the high-level components and integration points the feature touches.
5. **Write the PRD** — Use the template below. Submit as a GitHub issue if a repo is connected.

## PRD Template

```
# PRD: [Feature Name]

## Summary
One paragraph describing what this feature does and why it matters.

## User Stories
- As a [role], I want to [action] so that [outcome].
- As a [role], I want to [action] so that [outcome].
(Add as many as needed — these are the core of the PRD.)

## Scope
### In Scope
- ...

### Out of Scope
- ...

## Major Modules / Components
- [Module name]: [responsibility]

## Open Questions
- Any unresolved decisions that need answers before implementation.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

## Notes

- User stories are the most important part. They describe desired behaviour in plain language.
- Be explicit about what is out of scope to prevent scope creep.
- Once the PRD is written, suggest running `/prd-to-issues` to break it into executable tasks.

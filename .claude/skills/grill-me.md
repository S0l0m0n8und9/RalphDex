---
name: grill-me
description: Flesh out an idea by interviewing the user relentlessly before any planning or coding begins. Use when the user says /grill-me, "grill me", "interview me about this", or wants to fully think through a feature/design before committing to code.
---

# /grill-me — Flesh Out an Idea

Interview me relentlessly about every aspect of this plan until we reach a shared understanding.

Walk down each branch of the design tree, resolving dependencies between decisions one by one.

If a question can be answered by exploring the codebase, explore the codebase instead of asking me.

## Guidance

- Do NOT produce a plan, document, or code until the interview is complete and a shared understanding has been reached.
- Ask one focused question at a time. Wait for the answer before moving to the next branch.
- Use the design tree concept: at each decision point, identify the options, pick one with the user, then walk down that branch fully before moving to the next.
- If the codebase can answer a question (e.g. "does X already exist?"), explore it first — don't waste the user's time.
- Sessions should run as long as needed. 10 questions is short. 40–50 is normal for complex features.
- Only when both parties have reached a shared understanding should you offer to proceed to `/write-a-prd`.

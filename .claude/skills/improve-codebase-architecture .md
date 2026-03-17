---
name: improve-codebase-architecture
description: Analyse the codebase for architectural weaknesses and propose improvements to make it more agent-friendly and testable. Use when the user says /improve-codebase-architecture, "improve the architecture", "refactor the codebase structure", or wants to prepare a codebase for better AI-assisted development. Run weekly or after a surge of development.
---

# /improve-codebase-architecture — Make Your Code Agent-Friendly

Explore the codebase and identify opportunities to deepen shallow modules, clarify boundaries, and reduce integration risk.

## When to Run

- Once a week during active development.
- After a surge of AI-assisted feature development (code tends to accumulate shallow modules).
- Before starting a major new feature — a clean architecture makes TDD dramatically easier.
- When agent output quality feels like it's declining.

## Exploration Checklist

Walk the codebase looking for these specific smells:

### 1. Concept Sprawl
Where does understanding one concept require bouncing between many small files?
- Look for: types defined in one file, logic in another, helpers in a third — all for the same concept.
- Fix: consolidate into a single deep module with a clean public interface.

### 2. Purity Extraction Anti-Pattern
Where have pure functions been extracted just for testability, but the real bugs hide in how they're called?
- Look for: tiny utility files with functions that only exist to make something "unit testable".
- Fix: move the logic back into the calling module and test at the integration boundary instead.

### 3. Tight Coupling
Where do tightly coupled modules create integration risk?
- Look for: modules that import directly from each other's internals, circular dependencies, or two modules that always change together.
- Fix: introduce a clear interface or merge them into one module.

### 4. Shallow Modules
Where are modules doing too little?
- Look for: files under ~50 lines that are just pass-throughs or thin wrappers.
- Fix: merge into the caller or the dependency, whichever makes the interface cleaner.

## Output Format

Present findings as **deepening opportunities** — not a list of problems:

```
## Deepening Opportunity: [Area Name]

**Current state:** [describe the sprawl/coupling/shallowness]

**Proposed change:** [describe the consolidation]

**Benefit:** [why this makes the codebase more navigable for agents and humans]

**Risk:** [what could break, what tests to run after]
```

Prioritise by impact. Present the top 3–5 opportunities. Do not try to fix everything at once.

## Notes

- This skill identifies candidates. The user decides which to act on.
- After making architectural changes, run `/tdd` on the affected modules to ensure behaviour is preserved.
- The goal is not perfect architecture — it's architecture that agents can navigate confidently.

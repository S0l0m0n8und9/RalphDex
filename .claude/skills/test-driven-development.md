---
name: tdd
description: Implement a feature or fix using Test-Driven Development (red-green-refactor). Use when the user says /tdd, "use TDD", "write tests first", or wants to ensure high code quality through a disciplined test-first loop.
---

# /tdd — Test-Driven Development Loop

Implement using a strict red-green-refactor loop. One test at a time. No implementation before the test exists.

## Philosophy

- **Deep modules beat shallow ones.** Prefer fewer, larger modules with thin interfaces over many tiny files. AI navigates deep modules far better than a sea of small undifferentiated ones.
- **Mock at boundaries, not internals.** Mocks belong at I/O boundaries (HTTP, DB, filesystem). Avoid mocking internal functions just to make them testable — that's a sign the module is too shallow.
- **Tests describe behaviour, not implementation.** If your test breaks when you refactor internals without changing behaviour, the test is wrong.
- **Refactoring is mandatory, not optional.** Green without refactor is half the loop.

## Workflow

### Step 1 — Confirm Interface Changes
Before writing any tests, identify what interface changes this work requires:
- What new functions, methods, or endpoints are being added?
- What existing interfaces are changing?
- Are there modules that should be merged or deepened first?

If the codebase has poor module structure, suggest running `/improve-codebase-architecture` first.

### Step 2 — Design for Testability
For each behaviour to implement:
- Where is the right layer to test it?
- What is the minimal interface needed?
- What needs to be mocked (I/O only)?

### Step 3 — Red-Green-Refactor Loop

Repeat until the issue is complete:

1. **Write one failing test** (red) — describe the behaviour, not the implementation.
2. **Write the minimum code to make it pass** (green) — no gold-plating.
3. **Refactor** — improve structure, naming, and module depth without changing behaviour.
4. **Confirm the test still passes.**
5. **Look for the next behaviour to test.** Loop.

### Step 4 — Done When
- All acceptance criteria from the issue are covered by passing tests.
- No dead code was introduced.
- Module interfaces are clean and minimal.

## Notes

- Never skip the refactor step. This is where code quality actually improves.
- If you find yourself wanting to write two tests at once, you've found a seam — note it and finish the current test first.
- Run the full test suite after each green step to catch regressions early.

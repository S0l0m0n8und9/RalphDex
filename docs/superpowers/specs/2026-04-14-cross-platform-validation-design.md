# Cross-Platform Validation Command Design

## Goal

Make Ralphdex validation commands portable across Windows, Linux, and macOS by removing shell-specific environment-variable syntax from verifier execution semantics.

## Problem

Ralph currently treats task validation as an opaque shell string. That allows POSIX-only forms such as `RALPH_E2E=1 npm run test:e2e-pipeline` to be persisted in task metadata and then executed with `shell: true` under whatever host shell happens to be active. On Windows, that command fails before `npm` starts.

Preflight also overstates readiness. It confirms the extracted executable token (`npm`) and then reports the full validation command as executable, even when the surrounding shell syntax is invalid for the current platform.

## Design

Ralph should normalize leading `KEY=value` prefixes into structured environment overrides before execution. The verifier will:

- parse zero or more leading env assignments from a validation command
- keep the remaining command text as the executable command
- execute the remaining command with `runProcess(..., shell: true, env: parsedEnv)`
- use the same parsed command when checking readiness so the readiness probe talks about the actual executable command, not the raw shell string

This keeps existing task hints workable while removing dependence on shell-specific env-prefix syntax.

## Scope

In scope:

- verifier parsing and execution for leading env assignments
- readiness reporting based on the normalized executable command
- tests covering portable env-prefix execution behavior
- operator docs and T122 task metadata wording

Out of scope:

- a full structured task-schema migration for validation commands
- support for arbitrary shell syntax rewrites beyond leading `KEY=value` prefixes
- changing non-verifier command execution paths

## Acceptance Criteria

- A validation string like `RALPH_E2E=1 npm run test:e2e-pipeline` executes through the verifier on Windows, Linux, and macOS without relying on shell-specific assignment syntax.
- Preflight no longer claims the entire raw command is executable when it only validated the extracted executable token.
- Verifier tests cover env-prefix parsing and execution-env propagation.
- Docs no longer present POSIX-only validation examples as the portable operator contract.

# Pipeline Command Audit (2026-05-04)

This note records the current pipeline-related command surface without deleting commands. Source of truth for contributed commands is `package.json`; command wiring is in `src/commands/registerCommands.ts` and `src/commands/artifactCommands.ts`.

## Findings

| Command ID | Title | Status | Notes |
| --- | --- | --- | --- |
| `ralphCodex.runPipeline` | `Ralphdex: Run Pipeline` | supported | Primary end-to-end pipeline path; scaffolds tasks and delegates loop/review/SCM phases. |
| `ralphCodex.openLatestPipelineRun` | `Ralphdex: Open Latest Pipeline Run` | supported | Read-only artifact inspection surface for latest pipeline run JSON. |
| `ralphCodex.runMultiAgentLoop` | `Ralphdex: Run Multi-Agent Loop` | supported (shared) | Shared loop command; used directly by operators and delegated internally by pipeline execution. |
| `ralphCodex.runReviewAgent` | `Ralphdex: Run Review Agent` | supported (shared) | Shared review phase command invoked by pipeline after loop completion. |
| `ralphCodex.runScmAgent` | `Ralphdex: Run SCM Agent` | supported (shared) | Shared SCM phase command invoked by pipeline after review. |

## Result

- No stale or redundant pipeline-specific contributed commands were found in this audit snapshot.
- No command deletions were performed.

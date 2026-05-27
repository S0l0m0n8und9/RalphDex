export const LINKS = {
  marketplace: 'https://marketplace.visualstudio.com/items?itemName=s0l0m0n8und9.ralphdex',
  github: 'https://github.com/S0l0m0n8und9/RalphDex',
  deepwiki: 'https://deepwiki.com/S0l0m0n8und9/RalphDex',
  issues: 'https://github.com/S0l0m0n8und9/RalphDex/issues',
  license: 'https://github.com/S0l0m0n8und9/RalphDex/blob/main/LICENSE',
} as const;

export const workflowStages = [
  {
    step: '01',
    title: 'Define work',
    text: 'Capture the objective in a PRD and turn it into a durable task graph.',
    artifact: '.ralph/prd.md',
  },
  {
    step: '02',
    title: 'Execute deliberately',
    text: 'Hand work to your IDE or run bounded CLI iterations with the configured provider.',
    artifact: 'prompt-evidence.json',
  },
  {
    step: '03',
    title: 'Verify outcomes',
    text: 'Apply deterministic checks, stop conditions, and review gates after every run.',
    artifact: 'verification',
  },
  {
    step: '04',
    title: 'Inspect evidence',
    text: 'Review prompts, transcripts, results, and provenance before trusting completion.',
    artifact: 'provenance',
  },
] as const;

export const capabilities = [
  {
    title: 'File-backed state',
    text: 'Objectives, tasks, progress, and run artifacts persist under .ralph/ instead of disappearing with a chat session.',
    tone: 'amber',
  },
  {
    title: 'Multiple execution paths',
    text: 'Use IDE prompt handoff or controlled CLI runs across supported Codex, Claude, Copilot, Azure, and Gemini providers.',
    tone: 'cyan',
  },
  {
    title: 'Deterministic control',
    text: 'Preflight checks, verifier passes, bounded remediation, and explicit stop reasons keep loops reviewable.',
    tone: 'green',
  },
  {
    title: 'Inspectable provenance',
    text: 'Iteration artifacts retain what was prepared, executed, verified, and reconciled into durable task state.',
    tone: 'amber',
  },
] as const;

import { PromptBuildInput, RepoSummary } from './types';

function section(title: string, content: string): string {
  return `## ${title}\n${content.trim()}\n`;
}

function repoFacts(summary: RepoSummary): string {
  return [
    `- Workspace: ${summary.workspaceName}`,
    `- Root path: ${summary.rootPath}`,
    `- Manifests detected: ${summary.manifests.join(', ') || 'none detected'}`,
    `- Package managers / ecosystems: ${summary.packageManagers.join(', ') || 'unknown'}`,
    `- CI files: ${summary.ciFiles.join(', ') || 'none detected'}`,
    `- Docs: ${summary.docs.join(', ') || 'none detected'}`,
    `- Source roots: ${summary.sourceRoots.join(', ') || 'none detected'}`,
    `- Test signals: ${summary.testSignals.join(' | ') || 'unknown'}`
  ].join('\n');
}

export function buildBootstrapPrompt(summary: RepoSummary, objective: string): string {
  return [
    '# Ralph Codex Bootstrap Prompt',
    '',
    'You are starting a fresh Codex iteration inside an existing repository.',
    '',
    section('Objective', objective),
    section('Operating rules', [
      '- Inspect the repo before changing files.',
      '- Do not invent architecture or workflows not evidenced in the repo.',
      '- Prefer minimal, composable changes over framework-heavy abstraction.',
      '- Create or update durable repo memory in files, not chat-only reasoning.',
      '- If a fact is unknown, record it explicitly as Unknown instead of guessing.',
      '- End the iteration by updating .ralph/progress.md and .ralph/tasks.json if they exist.'
    ].join('\n')),
    section('Repo snapshot', repoFacts(summary)),
    section('Required outputs', [
      '1. A concise plan grounded in the repo.',
      '2. The smallest useful implementation step.',
      '3. Validation evidence from tests, builds, or static checks if available.',
      '4. An update to progress artifacts so the next fresh iteration can continue.'
    ].join('\n')),
    section('Mandatory Ralph discipline', [
      '- Treat this run as disposable context.',
      '- Persist progress in files.',
      '- Leave the repo easier for the next iteration to understand.',
      '- Do not stop at analysis only unless blocked by missing access or a real defect in the environment.'
    ].join('\n'))
  ].join('\n');
}

export function buildIterationPrompt(input: PromptBuildInput): string {
  return [
    `# Ralph Codex Iteration ${input.iteration}`,
    '',
    'You are a fresh Codex run continuing prior work using repository state, not chat memory.',
    '',
    section('Objective', input.objective),
    section('Repo snapshot', repoFacts(input.summary)),
    section('Current progress log', input.progressText || 'No progress log found.'),
    section('Current task list', input.tasksText || 'No tasks file found.'),
    section('Instructions', [
      '- Read the repository state and the progress/task files first.',
      '- Select the highest-value incomplete task that is realistically executable now.',
      '- Make the smallest coherent change that advances the objective.',
      '- Validate the change using the repo’s real commands.',
      '- Append a short iteration note to .ralph/progress.md with what changed, what was validated, and what remains.',
      '- Update task status in .ralph/tasks.json when appropriate.',
      '- If blocked, record the blocker precisely and leave a next action for the following run.'
    ].join('\n')),
    section('Output contract', [
      'Return:',
      '1. chosen task',
      '2. files changed',
      '3. validation result',
      '4. blocker or next task'
    ].join('\n'))
  ].join('\n');
}

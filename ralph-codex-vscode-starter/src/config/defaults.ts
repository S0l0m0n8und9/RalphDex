import { RalphCodexConfig } from './types';

export const DEFAULT_CONFIG: RalphCodexConfig = {
  codexCommandPath: 'codex',
  preferredHandoffMode: 'ideCommand',
  inspectionRootOverride: '',
  ralphIterationCap: 5,
  verifierModes: ['validationCommand', 'gitDiff', 'taskState'],
  noProgressThreshold: 2,
  repeatedFailureThreshold: 2,
  artifactRetentionPath: '.ralph/artifacts',
  provenanceBundleRetentionCount: 25,
  gitCheckpointMode: 'snapshotAndDiff',
  validationCommandOverride: '',
  stopOnHumanReviewNeeded: true,
  ralphTaskFilePath: '.ralph/tasks.json',
  prdPath: '.ralph/prd.md',
  progressPath: '.ralph/progress.md',
  promptTemplateDirectory: '',
  promptIncludeVerifierFeedback: true,
  promptPriorContextBudget: 8,
  clipboardAutoCopy: true,
  model: 'gpt-5.4',
  approvalMode: 'never',
  sandboxMode: 'workspace-write',
  openSidebarCommandId: 'chatgpt.openSidebar',
  newChatCommandId: 'chatgpt.newChat'
};

import { RalphCodexConfig } from './types';

export const DEFAULT_CONFIG: RalphCodexConfig = {
  codexCommandPath: 'codex',
  preferredHandoffMode: 'ideCommand',
  ralphIterationCap: 5,
  ralphTaskFilePath: '.ralph/tasks.json',
  prdPath: '.ralph/prd.md',
  progressPath: '.ralph/progress.md',
  clipboardAutoCopy: true,
  model: 'gpt-5.4',
  approvalMode: 'on-request',
  sandboxMode: 'workspace-write',
  openSidebarCommandId: 'chatgpt.openSidebar',
  newChatCommandId: 'chatgpt.newChat'
};

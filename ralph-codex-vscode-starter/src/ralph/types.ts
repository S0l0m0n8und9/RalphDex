export type RalphTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

export interface RalphTask {
  id: string;
  title: string;
  status: RalphTaskStatus;
  notes?: string;
  validation?: string;
  blocker?: string;
}

export interface RalphTaskFile {
  version: 1;
  tasks: RalphTask[];
}

export interface RalphTaskCounts {
  todo: number;
  in_progress: number;
  blocked: number;
  done: number;
}

export type RalphPromptKind = 'bootstrap' | 'iteration';
export type RalphRunMode = 'handoff' | 'singleExec' | 'loop';
export type RalphRunStatus = 'succeeded' | 'failed';

export interface RalphRunRecord {
  iteration: number;
  mode: RalphRunMode;
  promptKind: RalphPromptKind;
  startedAt: string;
  finishedAt: string;
  status: RalphRunStatus;
  exitCode: number | null;
  promptPath: string;
  transcriptPath?: string;
  lastMessagePath?: string;
  summary: string;
}

export interface RalphWorkspaceState {
  version: 1;
  objectivePreview: string | null;
  nextIteration: number;
  lastPromptKind: RalphPromptKind | null;
  lastPromptPath: string | null;
  lastRun: RalphRunRecord | null;
  runHistory: RalphRunRecord[];
  updatedAt: string;
}

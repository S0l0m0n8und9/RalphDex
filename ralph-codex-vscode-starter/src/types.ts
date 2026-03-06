export interface RepoSummary {
  workspaceName: string;
  rootPath: string;
  packageManagers: string[];
  manifests: string[];
  testSignals: string[];
  ciFiles: string[];
  docs: string[];
  sourceRoots: string[];
}

export interface PromptBuildInput {
  summary: RepoSummary;
  objective: string;
  iteration: number;
  progressText: string;
  tasksText: string;
}

export interface LoopOptions {
  maxIterations: number;
  objective: string;
  model: string;
  sandboxMode: string;
  approvalMode: string;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  promptPath: string;
  transcriptPath?: string;
}

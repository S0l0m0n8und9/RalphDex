import * as vscode from 'vscode';

export interface ExtensionConfig {
  codexExecutable: string;
  model: string;
  maxIterations: number;
  approvalMode: string;
  sandboxMode: string;
  autoOpenCodexSidebar: boolean;
  promptOutputFolder: string;
}

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('ralphCodex');
  return {
    codexExecutable: config.get<string>('codexExecutable', 'codex'),
    model: config.get<string>('model', 'gpt-5.4'),
    maxIterations: config.get<number>('maxIterations', 5),
    approvalMode: config.get<string>('approvalMode', 'on-request'),
    sandboxMode: config.get<string>('sandboxMode', 'workspace-write'),
    autoOpenCodexSidebar: config.get<boolean>('autoOpenCodexSidebar', true),
    promptOutputFolder: config.get<string>('promptOutputFolder', '.ralph/out')
  };
}

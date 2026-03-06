import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { RalphCodexConfig } from '../config/types';
import { Logger } from '../services/logger';
import { resolveRalphPaths, RalphPaths } from './pathResolver';
import { countTaskStatuses, createDefaultTaskFile, parseTaskFile, stringifyTaskFile } from './taskFile';
import { RalphPromptKind, RalphRunRecord, RalphTaskCounts, RalphTaskFile, RalphWorkspaceState } from './types';

const STATE_HISTORY_LIMIT = 20;

const DEFAULT_PRD = [
  '# Product / project brief',
  '',
  'Describe the current objective for Ralph here.',
  '',
  '- What should Codex change?',
  '- What constraints matter?',
  '- What does “done” look like?'
].join('\n');

const DEFAULT_PROGRESS = [
  '# Progress',
  '',
  '- Ralph workspace initialized.',
  '- Use this file for durable progress notes between fresh Codex runs.'
].join('\n');

function defaultState(): RalphWorkspaceState {
  return {
    version: 1,
    objectivePreview: null,
    nextIteration: 1,
    lastPromptKind: null,
    lastPromptPath: null,
    lastRun: null,
    runHistory: [],
    updatedAt: new Date().toISOString()
  };
}

function stateKey(rootPath: string): string {
  return `ralphCodex.workspaceState:${rootPath}`;
}

function summarizeObjective(text: string): string | null {
  const line = text
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.length > 0 && !value.startsWith('#') && !value.startsWith('-'));

  return line ? line.slice(0, 160) : null;
}

function normalizeWorkspaceState(candidate: unknown): RalphWorkspaceState {
  if (typeof candidate !== 'object' || candidate === null) {
    return defaultState();
  }

  const record = candidate as Record<string, unknown>;
  const history = Array.isArray(record.runHistory) ? record.runHistory.filter((item): item is RalphRunRecord => {
    if (typeof item !== 'object' || item === null) {
      return false;
    }

    const run = item as Record<string, unknown>;
    return typeof run.iteration === 'number'
      && typeof run.mode === 'string'
      && typeof run.promptKind === 'string'
      && typeof run.startedAt === 'string'
      && typeof run.finishedAt === 'string'
      && typeof run.status === 'string'
      && (typeof run.exitCode === 'number' || run.exitCode === null)
      && typeof run.promptPath === 'string'
      && typeof run.summary === 'string';
  }) : [];

  return {
    version: 1,
    objectivePreview: typeof record.objectivePreview === 'string' ? record.objectivePreview : null,
    nextIteration: typeof record.nextIteration === 'number' && record.nextIteration > 0 ? Math.floor(record.nextIteration) : 1,
    lastPromptKind: record.lastPromptKind === 'bootstrap' || record.lastPromptKind === 'iteration' ? record.lastPromptKind : null,
    lastPromptPath: typeof record.lastPromptPath === 'string' ? record.lastPromptPath : null,
    lastRun: history.length > 0 ? history[history.length - 1] : null,
    runHistory: history.slice(-STATE_HISTORY_LIMIT),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString()
  };
}

async function ensureFile(target: string, content: string): Promise<void> {
  try {
    await fs.access(target);
  } catch {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${content.trimEnd()}\n`, 'utf8');
  }
}

async function readText(target: string, fallback = ''): Promise<string> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    return fallback;
  }
}

export interface RalphWorkspaceSnapshot {
  paths: RalphPaths;
  state: RalphWorkspaceState;
}

export class RalphStateManager {
  public constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly logger: Logger
  ) {}

  public resolvePaths(rootPath: string, config: RalphCodexConfig): RalphPaths {
    return resolveRalphPaths(rootPath, config);
  }

  public async ensureWorkspace(rootPath: string, config: RalphCodexConfig): Promise<RalphWorkspaceSnapshot> {
    const paths = this.resolvePaths(rootPath, config);
    await fs.mkdir(paths.promptDir, { recursive: true });
    await fs.mkdir(paths.runDir, { recursive: true });
    await fs.mkdir(paths.logDir, { recursive: true });

    await ensureFile(paths.prdPath, DEFAULT_PRD);
    await ensureFile(paths.progressPath, DEFAULT_PROGRESS);

    try {
      await fs.access(paths.taskFilePath);
    } catch {
      await fs.mkdir(path.dirname(paths.taskFilePath), { recursive: true });
      await fs.writeFile(paths.taskFilePath, stringifyTaskFile(createDefaultTaskFile()), 'utf8');
    }

    const state = await this.loadState(rootPath, paths);
    await this.saveState(rootPath, paths, state);
    return { paths, state };
  }

  public async loadState(rootPath: string, paths: RalphPaths): Promise<RalphWorkspaceState> {
    const diskStateText = await readText(paths.stateFilePath);
    if (diskStateText.trim()) {
      try {
        return normalizeWorkspaceState(JSON.parse(diskStateText));
      } catch (error) {
        this.logger.warn('Failed to parse .ralph/state.json. Falling back to workspace storage.', {
          rootPath,
          stateFilePath: paths.stateFilePath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const storedState = await this.workspaceState.get<RalphWorkspaceState>(stateKey(rootPath));
    return normalizeWorkspaceState(storedState);
  }

  public async saveState(rootPath: string, paths: RalphPaths, state: RalphWorkspaceState): Promise<void> {
    const normalized = {
      ...state,
      lastRun: state.runHistory.length > 0 ? state.runHistory[state.runHistory.length - 1] : state.lastRun,
      updatedAt: new Date().toISOString()
    };

    await fs.writeFile(paths.stateFilePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    await this.workspaceState.update(stateKey(rootPath), normalized);
  }

  public async readObjectiveText(paths: RalphPaths): Promise<string> {
    return readText(paths.prdPath, `${DEFAULT_PRD}\n`);
  }

  public async writeObjectiveText(paths: RalphPaths, text: string): Promise<void> {
    await fs.writeFile(paths.prdPath, `${text.trimEnd()}\n`, 'utf8');
  }

  public async readProgressText(paths: RalphPaths): Promise<string> {
    return readText(paths.progressPath, `${DEFAULT_PROGRESS}\n`);
  }

  public async readTaskFileText(paths: RalphPaths): Promise<string> {
    const raw = await readText(paths.taskFilePath);
    if (!raw.trim()) {
      const seeded = stringifyTaskFile(createDefaultTaskFile());
      await fs.writeFile(paths.taskFilePath, seeded, 'utf8');
      return seeded;
    }

    parseTaskFile(raw);
    return raw;
  }

  public async readTaskFile(paths: RalphPaths): Promise<RalphTaskFile> {
    return parseTaskFile(await this.readTaskFileText(paths));
  }

  public async taskCounts(paths: RalphPaths): Promise<RalphTaskCounts> {
    return countTaskStatuses(await this.readTaskFile(paths));
  }

  public async writePrompt(paths: RalphPaths, fileName: string, prompt: string): Promise<string> {
    const target = path.join(paths.promptDir, fileName);
    await fs.writeFile(target, `${prompt.trimEnd()}\n`, 'utf8');
    return target;
  }

  public runArtifactPaths(paths: RalphPaths, artifactBaseName: string): { transcriptPath: string; lastMessagePath: string } {
    return {
      transcriptPath: path.join(paths.runDir, `${artifactBaseName}.transcript.md`),
      lastMessagePath: path.join(paths.runDir, `${artifactBaseName}.last-message.md`)
    };
  }

  public async recordPrompt(
    rootPath: string,
    paths: RalphPaths,
    state: RalphWorkspaceState,
    promptKind: RalphPromptKind,
    promptPath: string,
    objectiveText: string
  ): Promise<RalphWorkspaceState> {
    const nextState: RalphWorkspaceState = {
      ...state,
      objectivePreview: summarizeObjective(objectiveText),
      lastPromptKind: promptKind,
      lastPromptPath: promptPath,
      updatedAt: new Date().toISOString()
    };

    await this.saveState(rootPath, paths, nextState);
    return nextState;
  }

  public async recordRun(
    rootPath: string,
    paths: RalphPaths,
    state: RalphWorkspaceState,
    runRecord: RalphRunRecord,
    objectiveText: string
  ): Promise<RalphWorkspaceState> {
    const history = [...state.runHistory, runRecord].slice(-STATE_HISTORY_LIMIT);
    const nextState: RalphWorkspaceState = {
      ...state,
      objectivePreview: summarizeObjective(objectiveText),
      nextIteration: runRecord.iteration + 1,
      lastPromptKind: runRecord.promptKind,
      lastPromptPath: runRecord.promptPath,
      lastRun: runRecord,
      runHistory: history,
      updatedAt: new Date().toISOString()
    };

    await this.saveState(rootPath, paths, nextState);
    return nextState;
  }

  public async resetRuntimeState(rootPath: string, config: RalphCodexConfig): Promise<RalphWorkspaceSnapshot> {
    const paths = this.resolvePaths(rootPath, config);

    await fs.rm(paths.promptDir, { recursive: true, force: true });
    await fs.rm(paths.runDir, { recursive: true, force: true });
    await fs.rm(paths.logDir, { recursive: true, force: true });
    await fs.rm(paths.stateFilePath, { force: true });

    await this.workspaceState.update(stateKey(rootPath), undefined);
    return this.ensureWorkspace(rootPath, config);
  }

  public isDefaultObjective(text: string): boolean {
    return text.trim() === DEFAULT_PRD.trim();
  }
}

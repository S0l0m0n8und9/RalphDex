import * as crypto from 'node:crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { hashText, stableJson } from './integrity';
import {
  applySuggestedChildTasksToFile,
  bumpMutationCount,
  parseTaskFile,
  stringifyTaskFile,
  withTaskFileLock
} from './taskFile';
import type { RalphSuggestedChildTask, RalphTask, RalphTaskFile } from './types';

export type PipelineRunStatus = 'running' | 'complete' | 'failed' | 'awaiting_human_approval';

/**
 * Tracks which sub-phase of the pipeline was last successfully completed.
 * Used by crash recovery to determine where to re-enter on resume.
 */
export type PipelinePhase = 'scaffold' | 'loop' | 'review' | 'scm' | 'done' | 'failed';

export interface PipelineRunArtifact {
  schemaVersion: 1;
  kind: 'pipelineRun';
  runId: string;
  prdHash: string;
  prdPath: string;
  rootTaskId: string;
  decomposedTaskIds: string[];
  loopStartTime: string;
  status: PipelineRunStatus;
  /** Last sub-phase completed. Written after each phase so crash recovery can resume at the right point. */
  phase?: PipelinePhase;
  loopEndTime?: string;
  /** Path to the review-agent transcript produced after the multi-agent loop. */
  reviewTranscriptPath?: string;
  /** PR URL extracted from the SCM agent completion report, if available. */
  prUrl?: string;
}

const PR_URL_PATTERN = /https:\/\/[^\s"']+\/pull\/\d+/;

/**
 * Extract the first GitHub/GitLab PR URL from a progress note string.
 * Returns undefined when no match is found.
 */
export function extractPrUrl(progressNote: string | undefined): string | undefined {
  if (!progressNote) {
    return undefined;
  }

  const match = PR_URL_PATTERN.exec(progressNote);
  return match ? match[0] : undefined;
}

/**
 * Generate a deterministic pipeline run ID from a timestamp.
 * Format: pipeline-<yyyyMMddTHHmmssZ>-<4 hex chars>
 */
export function buildPipelineRunId(now: Date = new Date()): string {
  const compact = now.toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
    .replace('T', 'T');
  const jitter = crypto.randomBytes(2).toString('hex');
  return `pipeline-${compact}-${jitter}`;
}

const MAX_PIPELINE_CHILD_TASKS = 3;

/**
 * Parse level-2 markdown headings (## Heading) from a PRD text.
 * Falls back to level-1 headings, then to a single placeholder.
 * Returns at most MAX_PIPELINE_CHILD_TASKS segments.
 */
export function parsePrdSections(prdText: string): string[] {
  const h2 = [...prdText.matchAll(/^##\s+(.+)$/gm)]
    .map((m) => m[1].trim())
    .filter((t) => t.length > 0)
    .slice(0, MAX_PIPELINE_CHILD_TASKS);

  if (h2.length >= 1) {
    return h2;
  }

  const h1 = [...prdText.matchAll(/^#\s+(.+)$/gm)]
    .map((m) => m[1].trim())
    .filter((t) => t.length > 0)
    .slice(0, MAX_PIPELINE_CHILD_TASKS);

  if (h1.length >= 1) {
    return h1;
  }

  return ['Implement PRD objective'];
}

/**
 * Build the pipeline-root parent task (not yet written to disk).
 */
export function buildPipelineRootTask(rootTaskId: string, runId: string): RalphTask {
  return {
    id: rootTaskId,
    title: `Pipeline run ${runId}`,
    status: 'todo',
    notes: `Auto-generated pipeline root. Created by ralphCodex.runPipeline at ${new Date().toISOString()}.`
  };
}

/**
 * Build child task suggestions from PRD section titles.
 */
export function buildPipelineChildTasks(
  runId: string,
  rootTaskId: string,
  sections: string[]
): RalphSuggestedChildTask[] {
  return sections.map((title, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    return {
      id: `${rootTaskId}.${suffix}`,
      title,
      parentId: rootTaskId,
      dependsOn: index === 0
        ? []
        : [{ taskId: `${rootTaskId}.${String(index).padStart(2, '0')}`, reason: 'blocks_sequence' as const }],
      validation: null,
      rationale: `Auto-derived from PRD section for pipeline run ${runId}.`
    };
  });
}

/**
 * Add the pipeline-root task to the task file (under lock) and return it.
 */
export async function addPipelineRootTask(
  taskFilePath: string,
  rootTask: RalphTask
): Promise<RalphTaskFile> {
  const locked = await withTaskFileLock(taskFilePath, undefined, async () => {
    const taskFile = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
    const nextTaskFile = bumpMutationCount({
      ...taskFile,
      tasks: [...taskFile.tasks, rootTask]
    });
    await fs.writeFile(taskFilePath, stringifyTaskFile(nextTaskFile), 'utf8');
    return nextTaskFile;
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
  }

  return locked.value;
}

/**
 * Write the pipeline run artifact to .ralph/artifacts/pipelines/<runId>.json.
 */
export async function writePipelineArtifact(
  artifactDir: string,
  artifact: PipelineRunArtifact
): Promise<string> {
  const pipelinesDir = path.join(artifactDir, 'pipelines');
  await fs.mkdir(pipelinesDir, { recursive: true });
  const artifactPath = path.join(pipelinesDir, `${artifact.runId}.json`);
  await fs.writeFile(artifactPath, stableJson(artifact), 'utf8');
  return artifactPath;
}

/**
 * Orchestrate the full pipeline scaffold:
 * 1. Hash the PRD.
 * 2. Parse sections to derive child task titles.
 * 3. Add pipeline-root task to tasks.json.
 * 4. Add child tasks under the root.
 * 5. Write an initial pipeline artifact.
 * Returns the run artifact and the artifact file path.
 */
export async function scaffoldPipelineRun(input: {
  prdPath: string;
  taskFilePath: string;
  artifactDir: string;
}): Promise<{ artifact: PipelineRunArtifact; artifactPath: string; rootTaskId: string; childTaskIds: string[] }> {
  const prdText = await fs.readFile(input.prdPath, 'utf8');
  const prdHash = hashText(prdText);
  const runId = buildPipelineRunId();
  const rootTaskId = `Tpipe-${runId.replace(/^pipeline-/, '')}`;

  const sections = parsePrdSections(prdText);
  const rootTask = buildPipelineRootTask(rootTaskId, runId);
  const childTasks = buildPipelineChildTasks(runId, rootTaskId, sections);
  const childTaskIds = childTasks.map((t) => t.id);

  await addPipelineRootTask(input.taskFilePath, rootTask);
  await applySuggestedChildTasksToFile(input.taskFilePath, rootTaskId, childTasks);

  const loopStartTime = new Date().toISOString();
  const artifact: PipelineRunArtifact = {
    schemaVersion: 1,
    kind: 'pipelineRun',
    runId,
    prdHash,
    prdPath: input.prdPath,
    rootTaskId,
    decomposedTaskIds: childTaskIds,
    loopStartTime,
    status: 'running',
    phase: 'scaffold'
  };

  const artifactPath = await writePipelineArtifact(input.artifactDir, artifact);
  return { artifact, artifactPath, rootTaskId, childTaskIds };
}

export interface PipelinePendingHandoff {
  schemaVersion: 1;
  kind: 'pipelinePendingHandoff';
  runId: string;
  artifactPath: string;
  reviewTranscriptPath?: string;
  createdAt: string;
}

/**
 * Return the canonical path for a pipeline pending-handoff file.
 */
export function resolvePendingHandoffPath(handoffDir: string, runId: string): string {
  return path.join(handoffDir, `pipeline-${runId}-pending.json`);
}

/**
 * Write a pending-handoff file to .ralph/handoff/ and return its path.
 */
export async function writePipelinePendingHandoff(
  handoffDir: string,
  handoff: PipelinePendingHandoff
): Promise<string> {
  await fs.mkdir(handoffDir, { recursive: true });
  const handoffPath = resolvePendingHandoffPath(handoffDir, handoff.runId);
  await fs.writeFile(handoffPath, stableJson(handoff), 'utf8');
  return handoffPath;
}

/**
 * Read and parse a pending-handoff file from disk.
 */
export async function readPipelinePendingHandoff(handoffPath: string): Promise<PipelinePendingHandoff> {
  const raw = await fs.readFile(handoffPath, 'utf8');
  return JSON.parse(raw) as PipelinePendingHandoff;
}

/**
 * Phases that indicate a pipeline was interrupted mid-run and can be resumed.
 * An artifact with status 'running' and one of these phases was written before
 * the next sub-phase started, so the resume entry point is deterministic.
 */
const RESUMABLE_PHASES: ReadonlySet<PipelinePhase> = new Set([
  'scaffold',
  'loop',
  'review',
  'scm'
]);

/**
 * Scan <artifactDir>/pipelines/ and return all pipeline run artifacts that
 * have status 'running' and a phase in the resumable set.
 * These are candidates for ralphCodex.resumePipeline.
 */
export async function findResumablePipelineArtifacts(
  artifactDir: string
): Promise<Array<{ artifact: PipelineRunArtifact; artifactPath: string }>> {
  const pipelinesDir = path.join(artifactDir, 'pipelines');
  let entries: string[];
  try {
    entries = await fs.readdir(pipelinesDir);
  } catch {
    return [];
  }

  const jsonFiles = entries.filter((name) => name.endsWith('.json')).sort();
  const results: Array<{ artifact: PipelineRunArtifact; artifactPath: string }> = [];

  for (const name of jsonFiles) {
    const artifactPath = path.join(pipelinesDir, name);
    try {
      const raw = await fs.readFile(artifactPath, 'utf8');
      const artifact = JSON.parse(raw) as PipelineRunArtifact;
      if (
        artifact.kind === 'pipelineRun' &&
        typeof artifact.runId === 'string' &&
        artifact.status === 'running' &&
        artifact.phase !== undefined &&
        RESUMABLE_PHASES.has(artifact.phase)
      ) {
        results.push({ artifact, artifactPath });
      }
    } catch {
      // skip malformed files
    }
  }

  return results;
}

/**
 * Find and parse the most recent pipeline run artifact from
 * <artifactDir>/pipelines/<runId>.json.
 * Returns null when no artifacts exist or the directory is absent.
 */
export async function readLatestPipelineArtifact(
  artifactDir: string
): Promise<{ artifact: PipelineRunArtifact; artifactPath: string } | null> {
  const pipelinesDir = path.join(artifactDir, 'pipelines');
  let entries: string[];
  try {
    entries = await fs.readdir(pipelinesDir);
  } catch {
    return null;
  }

  const jsonFiles = entries.filter((name) => name.endsWith('.json')).sort().reverse();
  for (const name of jsonFiles) {
    const artifactPath = path.join(pipelinesDir, name);
    try {
      const raw = await fs.readFile(artifactPath, 'utf8');
      const artifact = JSON.parse(raw) as PipelineRunArtifact;
      if (artifact.kind === 'pipelineRun' && typeof artifact.runId === 'string') {
        return { artifact, artifactPath };
      }
    } catch {
      // skip malformed files
    }
  }

  return null;
}

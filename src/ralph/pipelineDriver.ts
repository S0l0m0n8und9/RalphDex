import type { PipelineRunArtifact } from './pipeline';

/**
 * The sub-phase a full-workflow ("Run Full Workflow") run is (re)entered at.
 * `loop` is a fresh run; `review`/`scm` are crash-recovery resume points.
 */
export type PipelineStartPhase = 'loop' | 'review' | 'scm';

/**
 * Injected executors for the three full-workflow roles. The driver owns the
 * deterministic phase sequencing (which role runs, in what order, and how a
 * failure short-circuits the rest); these runners own only the side effect of
 * actually executing a role. In the extension they wrap
 * `vscode.commands.executeCommand(...)`; in tests they are fakes, which is what
 * lets the full-workflow contract be validated without the Extension Host.
 */
export interface PipelineRoleRunners {
  /**
   * Runs the multi-agent loop. Resolving means the loop completed; a thrown
   * error is treated as a loop failure that stops the run before review/SCM.
   */
  runLoop(): Promise<void>;
  /** Runs the review agent. May return a transcript path for provenance. */
  runReview(): Promise<{ transcriptPath?: string } | undefined>;
  /** Runs the SCM agent. May return a PR URL extracted from its report. */
  runScm(): Promise<{ prUrl?: string } | undefined>;
}

export interface PipelineDriverOptions {
  /** Sub-phase to enter at (`loop` for a fresh run, `review`/`scm` to resume). */
  startPhase: PipelineStartPhase;
  /** The scaffolded pipeline-run artifact to advance. */
  artifact: PipelineRunArtifact;
  /** Role executors (real VS Code commands in production, fakes in tests). */
  runners: PipelineRoleRunners;
  /**
   * Persists a checkpoint. Called once per phase transition with the fully
   * merged artifact, mirroring the on-disk write the extension performs after
   * each phase so crash recovery can resume at the right point.
   */
  checkpoint(artifact: PipelineRunArtifact): Promise<void>;
  /** Optional progress-message sink (no-op when omitted). */
  reportProgress?(message: string): void;
  /** Optional structured error sink for non-fatal phase failures. */
  onError?(message: string, error: unknown): void;
  /** Injectable clock for `loopEndTime`; defaults to the current time. */
  now?(): string;
}

export interface PipelineDriverResult {
  /** The finalized artifact (status, `phase: 'done'`, and any PR URL). */
  artifact: PipelineRunArtifact;
  /** Roles actually attempted, in order — the observable role sequence. */
  rolesRun: PipelineStartPhase[];
  /** Terminal run status (`failed` only when the loop phase failed). */
  status: 'complete' | 'failed';
}

/**
 * Drives a full-workflow run through the loop → review → SCM → done phase
 * sequence, persisting a checkpoint after each transition.
 *
 * **Contract enforced (independent of the Extension Host):**
 * - `loop` start runs the multi-agent loop first; a loop failure stops the run
 *   before review and SCM, finalizing with status `failed` and no PR URL.
 * - When the loop completes (or the run resumes at `review`), the review agent
 *   runs and its transcript path is recorded; a review failure is logged and
 *   skips SCM but does not flip the run to `failed`.
 * - Resuming at `scm` skips loop and review and runs SCM directly.
 * - The SCM agent's PR URL is propagated onto the final artifact only when
 *   present, so the PR-artifact shape is exercised without real Git calls.
 *
 * Behavior mirrors the previous inline `runPipelineFromPhase` exactly; it is
 * extracted here purely so the sequencing/stop-reason/PR-shape contract is
 * unit-testable in the default `npm run validate` gate.
 */
export async function drivePipelineRun(
  options: PipelineDriverOptions
): Promise<PipelineDriverResult> {
  const { startPhase, runners, checkpoint } = options;
  const reportProgress = options.reportProgress ?? (() => {});
  const onError = options.onError ?? (() => {});
  const now = options.now ?? (() => new Date().toISOString());

  let current = options.artifact;
  const rolesRun: PipelineStartPhase[] = [];

  const writeCheckpoint = async (updates: Partial<PipelineRunArtifact>): Promise<void> => {
    current = { ...current, ...updates };
    await checkpoint(current);
  };

  // --- Loop phase ---
  let loopStatus: 'complete' | 'failed' = 'complete';
  if (startPhase === 'loop') {
    rolesRun.push('loop');
    reportProgress(
      `Pipeline ${current.runId}: starting multi-agent loop (${current.decomposedTaskIds.length} task(s))`
    );
    try {
      await runners.runLoop();
    } catch (error) {
      loopStatus = 'failed';
      onError('Pipeline multi-agent loop failed.', error);
    }
    if (loopStatus === 'complete') {
      await writeCheckpoint({ phase: 'loop' });
    }
  }

  // --- Review phase ---
  let reviewTranscriptPath: string | undefined;
  let runScm = startPhase === 'scm';

  if (loopStatus === 'complete' && startPhase !== 'scm') {
    rolesRun.push('review');
    reportProgress(`Pipeline ${current.runId}: running review agent`);
    try {
      const reviewRun = await runners.runReview();
      reviewTranscriptPath = reviewRun?.transcriptPath;
      await writeCheckpoint({
        phase: 'review',
        ...(reviewTranscriptPath !== undefined && { reviewTranscriptPath })
      });

      runScm = true;
    } catch (error) {
      onError('Pipeline review/SCM phase failed.', error);
    }
  }

  // --- SCM phase ---
  let prUrl: string | undefined;
  if (runScm) {
    rolesRun.push('scm');
    reportProgress(`Pipeline ${current.runId}: running SCM agent`);
    try {
      const scmRun = await runners.runScm();
      prUrl = scmRun?.prUrl;
    } catch (error) {
      onError('Pipeline SCM phase failed.', error);
    }
  }

  // --- Finalize ---
  await writeCheckpoint({
    status: loopStatus,
    loopEndTime: now(),
    phase: 'done',
    ...(prUrl !== undefined && { prUrl })
  });

  return { artifact: current, rolesRun, status: loopStatus };
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drivePipelineRun = drivePipelineRun;
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
async function drivePipelineRun(options) {
    const { startPhase, runners, checkpoint } = options;
    const reportProgress = options.reportProgress ?? (() => { });
    const onError = options.onError ?? (() => { });
    const now = options.now ?? (() => new Date().toISOString());
    let current = options.artifact;
    const rolesRun = [];
    const writeCheckpoint = async (updates) => {
        current = { ...current, ...updates };
        await checkpoint(current);
    };
    // --- Loop phase ---
    let loopStatus = 'complete';
    if (startPhase === 'loop') {
        rolesRun.push('loop');
        reportProgress(`Pipeline ${current.runId}: starting multi-agent loop (${current.decomposedTaskIds.length} task(s))`);
        try {
            await runners.runLoop();
        }
        catch (error) {
            loopStatus = 'failed';
            onError('Pipeline multi-agent loop failed.', error);
        }
        if (loopStatus === 'complete') {
            await writeCheckpoint({ phase: 'loop' });
        }
    }
    // --- Review phase ---
    let reviewTranscriptPath;
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
        }
        catch (error) {
            onError('Pipeline review phase failed.', error);
        }
    }
    // --- SCM phase ---
    let prUrl;
    if (runScm) {
        rolesRun.push('scm');
        reportProgress(`Pipeline ${current.runId}: running SCM agent`);
        try {
            const scmRun = await runners.runScm();
            prUrl = scmRun?.prUrl;
        }
        catch (error) {
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
//# sourceMappingURL=pipelineDriver.js.map
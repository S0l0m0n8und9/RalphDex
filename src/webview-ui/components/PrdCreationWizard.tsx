import type { PrdWizardStep, WizardInboundMessage, WizardState } from '../../webview/prdCreationWizardTypes';
import { StatusPill } from './primitives/Card';

const projectTypeOptions = [
  { value: 'web-app', title: 'Web App', description: 'Browser-based product with routed screens and UI flows.' },
  { value: 'cli-tool', title: 'CLI Tool', description: 'Command-line utility focused on repeatable automation.' },
  { value: 'library', title: 'Library', description: 'Reusable package, SDK, or module consumed by other code.' },
  { value: 'service', title: 'Service', description: 'Long-running backend, API, worker, or integration service.' },
  { value: 'documentation', title: 'Documentation', description: 'Repository or process documentation without source behavior changes.' }
];

const stepLabels: Record<PrdWizardStep, string> = {
  1: 'Project Shape',
  2: 'Draft Generation',
  3: 'PRD Review',
  4: 'Generate Tasks',
  5: 'Task Review',
  6: 'Confirm Write'
};

export const PRD_WIZARD_STEPS: PrdWizardStep[] = [1, 2, 3, 4, 5, 6];

interface PrdCreationWizardProps {
  state: WizardState;
  busy: boolean;
  onMessage: (message: WizardInboundMessage) => void;
}

function listValue(value: string[] | undefined): string {
  return (value ?? []).join('\n');
}

function dependencyValue(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }
  return value
    .map((entry) => typeof entry === 'string' ? entry : (
      entry && typeof entry === 'object' && 'taskId' in entry && typeof entry.taskId === 'string'
        ? entry.taskId
        : ''
    ))
    .filter(Boolean)
    .join('\n');
}

function hasPrdBlockers(state: WizardState): boolean {
  return (state.prdReviewFindings ?? []).some((finding) => finding.kind === 'blocker');
}

function hasTaskBlockers(state: WizardState): boolean {
  return (state.taskReviewFindings ?? []).some((finding) => finding.kind === 'blocker');
}

function canConfirmWrite(state: WizardState, busy: boolean): boolean {
  return Boolean(state.draft && !busy);
}

function generationTitle(state: WizardState): string {
  if (state.generationState === 'fallback') {
    return 'Fallback Draft';
  }
  if (state.generationState === 'weak') {
    return 'Weak Draft';
  }
  if (state.generationState === 'generated') {
    return 'Generated Draft';
  }
  return 'Status';
}

function actionTitle(state: WizardState): string {
  if (state.operationStatus === 'running') {
    return 'In Progress';
  }
  if (state.operationStatus === 'failed') {
    return 'Action Failed';
  }
  return 'Action Complete';
}

function Findings({ title, findings, empty }: { title: string; findings?: WizardState['prdReviewFindings']; empty: string }) {
  const items = findings ?? [];
  return (
    <section className="prd-note" data-testid={`${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <strong>{title}</strong>
      {items.length === 0 ? <p>{empty}</p> : (
        <ul className="prd-list">
          {items.map((finding, index) => (
            <li key={`${finding.kind}-${index}`} className={finding.kind}>{finding.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PrdCreationWizard({ state, busy, onMessage }: PrdCreationWizardProps) {
  const editableDraft = state.draft?.prdText ?? '';
  const taskCount = state.draft?.tasks.length ?? 0;
  const prdBlockers = hasPrdBlockers(state);
  const taskBlockers = hasTaskBlockers(state);
  const confirmEnabled = canConfirmWrite(state, busy);
  const writeGuidance = (prdBlockers || taskBlockers || state.tasksStale)
    ? [
        prdBlockers ? 'PRD has review blockers (see PRD Findings).' : null,
        taskBlockers ? 'Tasks have review blockers (see Task Findings).' : null,
        state.tasksStale ? 'Tasks were generated against an earlier PRD draft.' : null
      ].filter((entry): entry is string => entry !== null)
    : [];

  const setStep = (step: PrdWizardStep) => onMessage({ type: 'set-step', step });

  return (
    <div className="prd-wizard">
      <header className="prd-header">
        <div>
          <h1>PRD Creation Wizard</h1>
          <p>{state.mode === 'regenerate' ? 'Regenerate .ralph/prd.md and tasks.json' : 'Create .ralph/prd.md and tasks.json'}</p>
        </div>
        <div className="prd-status-strip" aria-label="Wizard status">
          <StatusPill kind={state.mode === 'regenerate' ? 'accent' : 'neutral'}>{state.mode}</StatusPill>
          <StatusPill kind={state.generationState === 'fallback' ? 'warn' : state.generationState === 'generated' ? 'ok' : 'neutral'}>draft: {state.generationState}</StatusPill>
          <StatusPill kind={state.tasksStale ? 'warn' : taskCount > 0 ? 'ok' : 'neutral'}>tasks: {taskCount}{state.tasksStale ? ' stale' : ''}</StatusPill>
        </div>
        {state.warning ? <div className="prd-warning">{state.warning}</div> : null}
        {state.error ? <div className="prd-error">{state.error}</div> : null}
      </header>

      <div className="prd-frame">
        <nav className="prd-step-nav" aria-label="PRD wizard steps">
          {PRD_WIZARD_STEPS.map((step) => (
            <button
              key={step}
              className={`prd-step-button ${state.step === step ? 'active' : ''}`}
              data-action="set-step"
              data-step={step}
              onClick={() => setStep(step)}
              type="button"
            >
              <span>{step}</span>
              {stepLabels[step]}
            </button>
          ))}
        </nav>

        <main className="prd-main">
          {state.step === 1 ? (
            <section className="prd-panel">
              <h2>1. Project Shape</h2>
              <div className="prd-picker-grid">
                {projectTypeOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`prd-picker ${state.projectType === option.value ? 'selected' : ''}`}
                    data-action="project-type"
                    data-value={option.value}
                    onClick={() => onMessage({ type: 'update-field', field: 'projectType', value: option.value })}
                    type="button"
                  >
                    <strong>{option.title}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
              <label className="prd-field">
                <span>Objective or PRD source</span>
                <textarea data-field="objective" value={state.objective} onChange={(event) => onMessage({ type: 'update-field', field: 'objective', value: event.currentTarget.value })} />
              </label>
              <label className="prd-field">
                <span>Tech stack</span>
                <textarea data-field="techStack" value={state.techStack} onChange={(event) => onMessage({ type: 'update-field', field: 'techStack', value: event.currentTarget.value })} />
              </label>
              <label className="prd-field">
                <span>Out-of-scope</span>
                <textarea data-field="outOfScope" value={state.outOfScope} onChange={(event) => onMessage({ type: 'update-field', field: 'outOfScope', value: event.currentTarget.value })} />
              </label>
              <label className="prd-field">
                <span>Existing conventions</span>
                <textarea data-field="existingConventions" value={state.existingConventions} onChange={(event) => onMessage({ type: 'update-field', field: 'existingConventions', value: event.currentTarget.value })} />
              </label>
              <div className="prd-actions">
                <button className="rdx-button primary" data-action="set-step" data-step="2" onClick={() => setStep(2)} type="button">Continue To Draft</button>
              </div>
            </section>
          ) : null}

          {state.step === 2 ? (
            <section className="prd-panel">
              <h2>2. Draft Generation</h2>
              <StatusBlocks state={state} />
              <div className="prd-actions">
                <button className="rdx-button primary" data-action="generate-prd-draft" disabled={busy} onClick={() => onMessage({ type: 'generate-prd-draft' })} type="button">
                  {state.mode === 'regenerate' ? 'Regenerate Draft' : 'Generate Draft'}
                </button>
                <button className="rdx-button" data-action="set-step" data-step="3" onClick={() => setStep(3)} type="button">Review PRD</button>
              </div>
            </section>
          ) : null}

          {state.step === 3 ? (
            <section className="prd-panel">
              <h2>3. PRD Review</h2>
              <StatusBlocks state={state} />
              {state.comparisonSummary ? <div className="prd-note"><strong>Comparison</strong><p>{state.comparisonSummary}</p></div> : null}
              <Findings title="PRD Findings" findings={state.prdReviewFindings} empty="No PRD findings yet." />
              <div className="prd-preview-grid">
                <label className="prd-field">
                  <span>{state.mode === 'regenerate' ? 'Editable regenerated draft' : 'Editable generated draft'}</span>
                  <textarea
                    data-action="draft-prd-text"
                    value={editableDraft}
                    onChange={(event) => onMessage({ type: 'update-draft-prd-text', value: event.currentTarget.value })}
                  />
                </label>
                {state.mode === 'regenerate' && state.currentPrdPreview ? (
                  <section className="prd-preview">
                    <strong>Current PRD</strong>
                    <pre>{state.currentPrdPreview}</pre>
                  </section>
                ) : null}
              </div>
              <div className="prd-actions">
                <button className="rdx-button primary" data-action="generate-prd-draft" disabled={busy} onClick={() => onMessage({ type: 'generate-prd-draft' })} type="button">
                  {state.mode === 'regenerate' ? 'Regenerate Draft' : 'Generate Draft'}
                </button>
                <button className="rdx-button" data-action="set-step" data-step="4" onClick={() => setStep(4)} type="button">Generate Tasks</button>
              </div>
            </section>
          ) : null}

          {state.step === 4 ? (
            <section className="prd-panel">
              <h2>4. Generate Tasks</h2>
              <Findings title="PRD Findings" findings={state.prdReviewFindings} empty="No PRD findings yet." />
              <div className="prd-note"><strong>Task Generation Status</strong><p>{state.taskGenerationMessage ?? 'No tasks generated yet.'}</p></div>
              <StatusBlocks state={state} operationOnly />
              {prdBlockers ? (
                <div className="prd-note">
                  <strong>Heads up</strong>
                  <p>PRD has readiness blockers. Task generation can still run, but generated tasks may need cleanup — review the PRD Findings above first.</p>
                </div>
              ) : null}
              <div className="prd-actions">
                <button className="rdx-button primary" data-action="generate-tasks" disabled={busy || !editableDraft} onClick={() => onMessage({ type: 'generate-tasks' })} type="button">Generate Tasks</button>
                <button className="rdx-button" data-action="set-step" data-step="5" onClick={() => setStep(5)} type="button">Review Tasks</button>
              </div>
            </section>
          ) : null}

          {state.step === 5 ? (
            <section className="prd-panel">
              <h2>5. Task Review</h2>
              <Findings title="Task Findings" findings={state.taskReviewFindings} empty="No task findings yet." />
              {state.tasksStale ? <div className="prd-warning">Tasks are stale because PRD text changed after generation. Regenerate tasks before writing.</div> : null}
              <TaskList state={state} onMessage={onMessage} />
              <div className="prd-actions">
                <button className="rdx-button primary" data-action="set-step" data-step="6" onClick={() => setStep(6)} type="button">Go To Confirm</button>
              </div>
            </section>
          ) : null}

          {state.step === 6 ? (
            <section className="prd-panel">
              <h2>6. Confirm Write</h2>
              <div className="prd-note">
                <strong>Targets</strong>
                <ul className="prd-list">
                  <li><code>{state.paths.prdPath}</code></li>
                  <li><code>{state.paths.tasksPath}</code>{taskCount === 0 ? ' (skipped — no tasks)' : ''}</li>
                </ul>
              </div>
              <Findings title="PRD Findings" findings={state.prdReviewFindings} empty="No PRD findings yet." />
              <Findings title="Task Findings" findings={state.taskReviewFindings} empty="No task findings yet." />
              {writeGuidance.length > 0 ? (
                <div className="prd-note">
                  <strong>Guidance — write will proceed</strong>
                  <ul className="prd-list">
                    {writeGuidance.map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                </div>
              ) : null}
              <StatusBlocks state={state} operationOnly />
              {state.writeSummary ? (
                <div className="prd-note">
                  <strong>Files written</strong>
                  {state.writeSummary.filesWritten.length === 0 ? (
                    <p>No files were written.</p>
                  ) : (
                    <ul className="prd-list">{state.writeSummary.filesWritten.map((file) => <li key={file}><code>{file}</code></li>)}</ul>
                  )}
                </div>
              ) : <p className="prd-empty">Confirm the write to persist prd.md (and tasks.json if tasks are present).</p>}
              <div className="prd-actions">
                <button className="rdx-button primary" data-action="confirm-write" disabled={!confirmEnabled} onClick={() => onMessage({ type: 'confirm-write' })} type="button">Write Files</button>
                <button className="rdx-button" data-action="set-step" data-step="5" onClick={() => setStep(5)} type="button">Back To Task Review</button>
              </div>
            </section>
          ) : null}
        </main>

      </div>
    </div>
  );
}

function StatusBlocks({ state, operationOnly = false }: { state: WizardState; operationOnly?: boolean }) {
  return (
    <>
      {!operationOnly ? (
        <div className={state.generationState === 'fallback' ? 'prd-warning' : 'prd-note'}>
          <strong>{generationTitle(state)}</strong>
          <p>{state.generationMessage || 'No draft generated yet.'}</p>
        </div>
      ) : null}
      {state.operationMessage ? (
        <div className={state.operationStatus === 'failed' ? 'prd-warning' : 'prd-note'}>
          <strong>{actionTitle(state)}</strong>
          <p>{state.operationMessage}</p>
        </div>
      ) : null}
    </>
  );
}

function TaskList({ state, onMessage }: { state: WizardState; onMessage: (message: WizardInboundMessage) => void }) {
  const tasks = state.draft?.tasks ?? [];
  if (tasks.length === 0) {
    return <p className="prd-empty">Generate tasks from the approved PRD to review task cards.</p>;
  }

  return (
    <div className="prd-task-list">
      {tasks.map((task) => (
        <article className="prd-task-card" key={task.id}>
          <header>
            <strong>{task.id}</strong>
            <label className="prd-field">
              <span>Title</span>
              <input data-action="task-title" data-task-id={task.id} value={task.title} onChange={(event) => onMessage({ type: 'update-task-title', taskId: task.id, title: event.currentTarget.value })} />
            </label>
            <label className="prd-select-field">
              <span>Tier</span>
              <select data-action="task-tier" data-task-id={task.id} value={task.tier ?? ''} onChange={(event) => onMessage({ type: 'update-task-tier', taskId: task.id, tier: event.currentTarget.value as '' | 'simple' | 'medium' | 'complex' })}>
                <option value="">Auto</option>
                <option value="simple">Simple</option>
                <option value="medium">Medium</option>
                <option value="complex">Complex</option>
              </select>
            </label>
          </header>
          <div className="prd-task-controls">
            <button className="rdx-button" data-action="move-task" data-task-id={task.id} data-direction="up" onClick={() => onMessage({ type: 'move-task', taskId: task.id, direction: 'up' })} type="button">Move Up</button>
            <button className="rdx-button" data-action="move-task" data-task-id={task.id} data-direction="down" onClick={() => onMessage({ type: 'move-task', taskId: task.id, direction: 'down' })} type="button">Move Down</button>
            <button className="rdx-button danger" data-action="delete-task" data-task-id={task.id} onClick={() => onMessage({ type: 'delete-task', taskId: task.id })} type="button">Delete</button>
          </div>
          <div className="prd-task-grid">
            <label className="prd-field">
              <span>Dependencies</span>
              <textarea data-action="task-dependencies" data-task-id={task.id} value={dependencyValue(task.dependsOn ?? task.dependencies)} onChange={(event) => onMessage({ type: 'update-task-dependencies', taskId: task.id, value: event.currentTarget.value })} />
            </label>
            <label className="prd-field">
              <span>Notes</span>
              <textarea data-action="task-notes" data-task-id={task.id} value={task.notes ?? ''} onChange={(event) => onMessage({ type: 'update-task-notes', taskId: task.id, value: event.currentTarget.value })} />
            </label>
            <label className="prd-field">
              <span>Acceptance</span>
              <textarea data-action="task-acceptance" data-task-id={task.id} value={listValue(task.acceptance)} onChange={(event) => onMessage({ type: 'update-task-acceptance', taskId: task.id, value: event.currentTarget.value })} />
            </label>
            <div className="prd-note compact">
              <strong>Validation</strong>
              <p>{task.validation || 'No task-specific validation hint'}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

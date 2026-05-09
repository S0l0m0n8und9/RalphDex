import type { RalphDashboardState } from '../../ui/uiTypes';
import type { WebviewUiModel } from '../viewModel';

interface TaskSummaryProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
}

export function TaskSummary({ state, model }: TaskSummaryProps) {
  const task = model.currentTask;
  const blocked = state.taskCounts?.blocked ?? state.tasks.filter((candidate) => candidate.status === 'blocked').length;

  return (
    <section className="rdx-section" aria-labelledby="task-summary-title">
      <div className="rdx-section-header">
        <h2 id="task-summary-title">Current Work</h2>
        <span className="rdx-state">{model.doneCount}/{model.taskTotal || 0} done</span>
      </div>
      {task ? (
        <div className="rdx-task">
          <div className="rdx-task-id">{task.id}</div>
          <div className="rdx-task-title">{task.title}</div>
          <div className="rdx-task-meta">{task.status}{blocked > 0 ? ` · ${blocked} blocked` : ''}</div>
        </div>
      ) : (
        <p>No task selected.</p>
      )}
    </section>
  );
}

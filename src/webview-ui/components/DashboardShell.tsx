import type { RalphDashboardState } from '../../ui/uiTypes';
import { CommandButton } from './CommandButton';
import { ReadinessSummary } from './ReadinessSummary';
import { SettingsPanel } from './SettingsPanel';
import { TaskSummary } from './TaskSummary';
import type { WebviewUiModel } from '../viewModel';

interface DashboardShellProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
  onCommand(command: string): void;
  onSettingUpdate(key: string, value: unknown): void;
}

export function DashboardShell({ state, model, onCommand, onSettingUpdate }: DashboardShellProps) {
  return (
    <main className="rdx-dashboard">
      <header className="rdx-topbar">
        <h1>Ralphdex</h1>
        <span>{state.agentRole}</span>
      </header>
      <ReadinessSummary readiness={model.readiness} workspaceName={state.workspaceName} loopState={state.loopState} />
      <section className="rdx-section commands" aria-label="Commands">
        {model.primaryCommands.map((command) => (
          <CommandButton key={command.command} command={command} onCommand={onCommand} />
        ))}
      </section>
      <div className="rdx-dashboard-grid">
        <TaskSummary state={state} model={model} />
        <section className="rdx-section" aria-labelledby="activity-title">
          <div className="rdx-section-header">
            <h2 id="activity-title">Recent Activity</h2>
          </div>
          {state.recentIterations.length > 0 ? (
            <ul className="rdx-list">
              {state.recentIterations.slice(0, 5).map((iteration) => (
                <li key={`${iteration.iteration}-${iteration.taskId ?? 'none'}`}>
                  #{iteration.iteration} · {iteration.taskId ?? 'no task'} · {iteration.classification.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          ) : (
            <p>No iterations recorded yet.</p>
          )}
        </section>
      </div>
      <section className="rdx-section commands secondary" aria-label="Secondary commands">
        {model.secondaryCommands.map((command) => (
          <CommandButton key={command.command} command={command} onCommand={onCommand} />
        ))}
      </section>
      <SettingsPanel settings={state.settingsSurface} onUpdate={onSettingUpdate} />
    </main>
  );
}

import type { RalphDashboardState } from '../../ui/uiTypes';
import { CommandButton } from './CommandButton';
import { ReadinessSummary } from './ReadinessSummary';
import { TaskSummary } from './TaskSummary';
import type { WebviewUiModel } from '../viewModel';

interface SidebarShellProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
  onCommand(command: string): void;
}

export function SidebarShell({ state, model, onCommand }: SidebarShellProps) {
  const sidebarCommands = [
    ...model.primaryCommands,
    { command: 'ralphCodex.openDashboard', label: 'Open Dashboard' }
  ];

  return (
    <aside className="rdx-sidebar">
      <header className="rdx-sidebar-header">
        <h1>Ralphdex</h1>
        <span>{state.workspaceName}</span>
      </header>
      <ReadinessSummary readiness={model.readiness} workspaceName={state.workspaceName} loopState={state.loopState} />
      <section className="rdx-section commands" aria-label="Sidebar commands">
        {sidebarCommands.map((command) => (
          <CommandButton key={command.command} command={command} onCommand={onCommand} />
        ))}
      </section>
      <TaskSummary state={state} model={model} />
    </aside>
  );
}

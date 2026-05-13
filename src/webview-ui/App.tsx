import { useEffect, useMemo, useState } from 'react';
import type { RalphDashboardState, RalphDoctrineProposalActionPayload, RalphWebviewMessage } from '../ui/uiTypes';
import { DashboardShell } from './components/DashboardShell';
import { SidebarShell } from './components/SidebarShell';
import { vscodeApi } from './bridge/vscode';
import { getWebviewUiModel } from './viewModel';

export type WebviewUiMode = 'dashboard' | 'sidebar';

interface AppProps {
  mode: WebviewUiMode;
  initialState: RalphDashboardState;
}

export function App({ mode, initialState }: AppProps) {
  const [state, setState] = useState(initialState);
  const [lastDoctrineActionResult, setLastDoctrineActionResult] = useState<Extract<RalphWebviewMessage, { type: 'doctrine-proposal-action-result' }> | null>(null);
  const model = useMemo(() => getWebviewUiModel(state), [state]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<RalphWebviewMessage>) => {
      const message = event.data;
      if (message.type === 'state') {
        setState(message.state);
      }
      if (message.type === 'doctrine-proposal-action-result') {
        setLastDoctrineActionResult(message);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const sendCommand = (command: string) => {
    vscodeApi().postMessage({ type: 'command', command });
  };
  const sendSettingUpdate = (key: string, value: unknown) => {
    vscodeApi().postMessage({ type: 'update-setting', key, value });
  };
  const sendOpenArtifact = (artifactDir: string) => {
    vscodeApi().postMessage({ type: 'open-iteration-artifact', artifactDir });
  };
  const sendSeedTasks = (requestText: string) => {
    vscodeApi().postMessage({ type: 'seed-tasks', requestText, source: 'panel' });
  };
  const sendDoctrineAction = (action: RalphDoctrineProposalActionPayload) => {
    vscodeApi().postMessage({ type: 'doctrine-proposal-action', ...action });
  };

  if (mode === 'sidebar') {
    return (
      <SidebarShell
        state={state} model={model}
        onCommand={sendCommand}
      />
    );
  }

  return (
    <DashboardShell
      state={state} model={model}
      onCommand={sendCommand} onSettingUpdate={sendSettingUpdate}
      onOpenArtifact={sendOpenArtifact} onSeedTasks={sendSeedTasks}
      onDoctrineAction={sendDoctrineAction}
      lastDoctrineActionResult={lastDoctrineActionResult}
    />
  );
}

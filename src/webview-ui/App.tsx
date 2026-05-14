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

export function applyOptimisticSettingUpdate(
  state: RalphDashboardState,
  key: string,
  value: unknown
): RalphDashboardState {
  if (!state.settingsSurface) {
    return state;
  }

  let changed = false;
  const sections = state.settingsSurface.sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => {
      if (entry.key !== key) {
        return entry;
      }
      changed = true;
      return { ...entry, value };
    })
  }));

  if (!changed) {
    return state;
  }

  return {
    ...state,
    settingsSurface: { sections }
  };
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
    setState((current) => applyOptimisticSettingUpdate(current, key, value));
    vscodeApi().postMessage({ type: 'update-setting', key, value });
  };
  const sendActiveTabChange = (activeTab: 'overview' | 'tasks' | 'diagnostics' | 'doctrine' | 'settings') => {
    vscodeApi().postMessage({ type: 'active-tab-changed', activeTab });
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
      onActiveTabChange={sendActiveTabChange}
      onOpenArtifact={sendOpenArtifact} onSeedTasks={sendSeedTasks}
      onDoctrineAction={sendDoctrineAction}
      lastDoctrineActionResult={lastDoctrineActionResult}
    />
  );
}

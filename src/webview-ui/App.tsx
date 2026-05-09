import { useEffect, useMemo, useState } from 'react';
import type { RalphDashboardState, RalphWebviewMessage } from '../ui/uiTypes';
import { DashboardShell } from './components/DashboardShell';
import { SidebarShell } from './components/SidebarShell';
import { vscodeApi } from './bridge/vscode';
import { getWebviewUiModel } from './viewModel';
import type { DashboardMode } from './viewModel';

export type WebviewUiMode = 'dashboard' | 'sidebar';

interface AppProps {
  mode: WebviewUiMode;
  initialState: RalphDashboardState;
}

export function App({ mode, initialState }: AppProps) {
  const [state, setState] = useState(initialState);
  const model = useMemo(() => getWebviewUiModel(state), [state]);

  const [dashboardMode, setDashboardMode] = useState<DashboardMode>(() => {
    const saved = vscodeApi().getState() as { dashboardMode?: DashboardMode } | undefined;
    return saved?.dashboardMode ?? 'standard';
  });

  const handleModeChange = (m: DashboardMode) => {
    setDashboardMode(m);
    const existing = vscodeApi().getState() as Record<string, unknown> | undefined ?? {};
    vscodeApi().setState({ ...existing, dashboardMode: m });
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent<RalphWebviewMessage>) => {
      const message = event.data;
      if (message.type === 'state') {
        setState(message.state);
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
      mode={dashboardMode} onModeChange={handleModeChange}
      onCommand={sendCommand} onSettingUpdate={sendSettingUpdate}
      onOpenArtifact={sendOpenArtifact}
    />
  );
}

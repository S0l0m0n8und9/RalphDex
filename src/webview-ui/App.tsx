import { useEffect, useMemo, useState } from 'react';
import type { RalphDashboardState, RalphDoctrineProposalActionPayload, RalphWebviewMessage } from '../ui/uiTypes';
import type { WizardInboundMessage, WizardOutboundMessage, WizardState } from '../webview/prdCreationWizardTypes';
import { DashboardShell } from './components/DashboardShell';
import { PrdCreationWizard } from './components/PrdCreationWizard';
import { SidebarShell } from './components/SidebarShell';
import { vscodeApi } from './bridge/vscode';
import { getWebviewUiModel } from './viewModel';

export type WebviewUiMode = 'dashboard' | 'sidebar' | 'prd-wizard';

type AppProps =
  | { mode: 'dashboard' | 'sidebar'; initialState: RalphDashboardState }
  | { mode: 'prd-wizard'; initialState?: WizardState };

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

export function applyOptimisticWizardMessage(
  state: WizardState,
  message: WizardInboundMessage
): WizardState {
  if (message.type === 'set-step') {
    return { ...state, step: message.step, warning: null, error: null };
  }
  return state;
}

export function App({ mode, initialState }: AppProps) {
  const [state, setState] = useState<RalphDashboardState | undefined>(mode === 'prd-wizard' ? undefined : initialState);
  const [wizardState, setWizardState] = useState<WizardState | undefined>(mode === 'prd-wizard' ? initialState : undefined);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [lastDoctrineActionResult, setLastDoctrineActionResult] = useState<Extract<RalphWebviewMessage, { type: 'doctrine-proposal-action-result' }> | null>(null);
  const model = useMemo(() => state ? getWebviewUiModel(state) : null, [state]);

  useEffect(() => {
    (vscodeApi() as { postMessage(message: unknown): void }).postMessage({
      type: 'webview-ready',
      mode,
      mountedText: mode === 'prd-wizard' ? 'Ralphdex PRD wizard mounted' : `Ralphdex ${mode} dashboard mounted`,
      timestamp: new Date().toISOString()
    });
  }, [mode]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<RalphWebviewMessage | WizardOutboundMessage>) => {
      const message = event.data;
      if (mode === 'prd-wizard') {
        const wizardMessage = message as WizardOutboundMessage;
        if (wizardMessage.type === 'state') {
          setWizardState(wizardMessage.state);
        }
        if (wizardMessage.type === 'busy') {
          setWizardBusy(wizardMessage.value);
        }
        return;
      }
      const dashboardMessage = message as RalphWebviewMessage;
      if (dashboardMessage.type === 'state') {
        setState(dashboardMessage.state);
      }
      if (dashboardMessage.type === 'doctrine-proposal-action-result') {
        setLastDoctrineActionResult(dashboardMessage);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const sendCommand = (command: string) => {
    vscodeApi().postMessage({ type: 'command', command });
  };
  const sendSettingUpdate = (key: string, value: unknown) => {
    setState((current) => current ? applyOptimisticSettingUpdate(current, key, value) : current);
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

  if (mode === 'prd-wizard') {
    const sendWizardMessage = (message: WizardInboundMessage) => {
      setWizardState((current) => current ? applyOptimisticWizardMessage(current, message) : current);
      (vscodeApi() as { postMessage(message: unknown): void }).postMessage(message);
    };
    return wizardState ? (
      <PrdCreationWizard
        state={wizardState}
        busy={wizardBusy}
        onMessage={sendWizardMessage}
      />
    ) : <div className="prd-wizard-loading">Loading PRD Creation Wizard...</div>;
  }

  if (!state || !model) {
    return null;
  }

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

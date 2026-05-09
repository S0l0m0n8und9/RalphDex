import React, { useState } from 'react';
import type { RalphDashboardState } from '../../ui/uiTypes';
import type { WebviewUiModel, DashboardMode } from '../viewModel';
import type { DiagnosisSection } from '../../webview/dashboardSnapshot';
import { HealthPulse } from './primitives/Card';
import { HeroNow } from './hero/HeroNow';
import { AgentLanes } from './panels/AgentLanes';
import { Timeline } from './panels/Timeline';
import { FailurePanel } from './panels/FailurePanel';
import { DiagnosticsPanel } from './panels/DiagnosticsPanel';
import { TaskPanel } from './tasks/TaskPanel';
import { Orchestration } from './orchestration/Orchestration';
import { SettingsPanel } from './SettingsPanel';

interface DashboardShellProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
  mode: DashboardMode;
  onModeChange: (mode: DashboardMode) => void;
  onCommand: (command: string) => void;
  onSettingUpdate: (key: string, value: unknown) => void;
  onOpenArtifact: (artifactDir: string) => void;
}

type TabId = 'overview' | 'tasks' | 'diagnostics' | 'orchestration' | 'settings';

function tabsForMode(mode: DashboardMode): { id: TabId; label: string }[] {
  const base: { id: TabId; label: string }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'tasks',     label: 'Tasks' },
  ];
  if (mode === 'standard' || mode === 'advanced') {
    base.push({ id: 'diagnostics', label: 'Diagnostics' });
  }
  if (mode === 'advanced') {
    base.push({ id: 'orchestration', label: 'Orchestration' });
  }
  base.push({ id: 'settings', label: 'Settings' });
  return base;
}

const MODES: { id: DashboardMode; label: string }[] = [
  { id: 'simple',   label: 'Simple' },
  { id: 'standard', label: 'Standard' },
  { id: 'advanced', label: 'Advanced' },
];

export function DashboardShell({ state, model, mode, onModeChange, onCommand, onSettingUpdate, onOpenArtifact }: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const tabs = tabsForMode(mode);
  const snapshot = state.dashboardSnapshot;
  const diagnosis: DiagnosisSection | null = snapshot?.diagnosis ?? null;

  const onStartLoop    = () => onCommand('ralphCodex.runRalphLoop');
  const onStopLoop     = () => onCommand('ralphCodex.stopLoop');
  const onRunIteration = () => onCommand('ralphCodex.runIteration');

  const content = (() => {
    if (activeTab === 'overview') {
      return (
        <>
          <HeroNow state={state} model={model} mode={mode}
            onStartLoop={onStartLoop} onStopLoop={onStopLoop} onRunIteration={onRunIteration} />
          {diagnosis && <FailurePanel diagnosis={diagnosis} onOpenArtifact={onOpenArtifact} />}
          {mode === 'simple' ? (
            <Timeline iterations={state.recentIterations} onOpenArtifact={onOpenArtifact} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
              <AgentLanes lanes={state.agentLanes} />
              <Timeline iterations={state.recentIterations} onOpenArtifact={onOpenArtifact} />
            </div>
          )}
        </>
      );
    }
    if (activeTab === 'tasks') {
      return <TaskPanel tasks={state.tasks} />;
    }
    if (activeTab === 'diagnostics') {
      return <DiagnosticsPanel diagnostics={state.diagnostics} />;
    }
    if (activeTab === 'orchestration' && snapshot?.cost) {
      return <Orchestration cost={snapshot.cost} />;
    }
    if (activeTab === 'settings') {
      return <SettingsPanel settings={state.settingsSurface} onUpdate={onSettingUpdate} />;
    }
    return null;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--rdx-surface)', color: 'var(--rdx-fg)', fontFamily: 'var(--rdx-font)' }}>
      {/* Tab bar */}
      <div className="rdx-tab-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', borderRight: '1px solid var(--rdx-border)', flexShrink: 0 }}>
          <HealthPulse state={state.loopState} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--rdx-fg)' }}>{state.workspaceName}</span>
        </div>
        {tabs.map(t => {
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: '0 16px', height: '100%', minHeight: 36,
              background: active ? 'var(--rdx-surface)' : 'transparent',
              color: active ? 'var(--rdx-fg)' : 'var(--rdx-dim)',
              border: 'none', borderBottom: active ? '2px solid var(--rdx-accent)' : '2px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
              fontWeight: active ? 600 : 400,
            }}>
              {t.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {/* Mode toggle in tab bar */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '0 10px' }}>
          {MODES.map(m => {
            const active = mode === m.id;
            return (
              <button key={m.id} onClick={() => onModeChange(m.id)} style={{
                padding: '3px 10px', fontSize: 11, fontFamily: 'inherit',
                background: active ? 'color-mix(in srgb, var(--rdx-accent) 15%, var(--rdx-surface-2))' : 'transparent',
                border: `1px solid ${active ? 'var(--rdx-accent)' : 'transparent'}`,
                borderRadius: 999, color: active ? 'var(--rdx-accent)' : 'var(--rdx-dim)',
                cursor: 'pointer',
              }}>
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="rdx-tab-content">
        {content}
      </div>
    </div>
  );
}

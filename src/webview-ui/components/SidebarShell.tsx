import React, { useState } from 'react';
import type { RalphDashboardState } from '../../ui/uiTypes';
import type { WebviewUiModel, DashboardMode } from '../viewModel';
import type { DiagnosisSection } from '../../webview/dashboardSnapshot';
import { HealthPulse, Icon, Btn } from './primitives/Card';
import { AgentLanes } from './panels/AgentLanes';
import { Timeline } from './panels/Timeline';
import { FailurePanel } from './panels/FailurePanel';
import { DiagnosticsPanel } from './panels/DiagnosticsPanel';
import { TaskPanel } from './tasks/TaskPanel';
import { Orchestration } from './orchestration/Orchestration';
import { SettingsPanel } from './SettingsPanel';

interface SidebarShellProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
  mode: DashboardMode;
  onModeChange: (mode: DashboardMode) => void;
  onCommand: (command: string) => void;
  onSettingUpdate: (key: string, value: unknown) => void;
  onOpenArtifact: (artifactDir: string) => void;
}

type TabId = 'overview' | 'tasks' | 'diagnostics' | 'orchestration' | 'settings';

interface TabDef { id: TabId; label: string; icon: React.ReactNode }

function tabsForMode(mode: DashboardMode): TabDef[] {
  const base: TabDef[] = [
    { id: 'overview',     label: 'Overview',     icon: Icon.bolt  },
    { id: 'tasks',        label: 'Tasks',        icon: Icon.graph },
  ];
  if (mode === 'standard' || mode === 'advanced') {
    base.push({ id: 'diagnostics', label: 'Diagnostics', icon: Icon.warn });
  }
  if (mode === 'advanced') {
    base.push({ id: 'orchestration', label: 'Orchestration', icon: Icon.cog });
  }
  base.push({ id: 'settings', label: 'Settings', icon: Icon.cog });
  return base;
}

const MODES: { id: DashboardMode; label: string; sub: string }[] = [
  { id: 'simple',   label: 'Simple',   sub: 'one-task' },
  { id: 'standard', label: 'Standard', sub: 'balanced' },
  { id: 'advanced', label: 'Advanced', sub: 'full detail' },
];

export function SidebarShell({ state, model, mode, onModeChange, onCommand, onSettingUpdate, onOpenArtifact }: SidebarShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const tabs = tabsForMode(mode);
  const snapshot = state.dashboardSnapshot;
  const diagnosis: DiagnosisSection | null = snapshot?.diagnosis ?? null;

  const onOpenFailure  = (path: string) => onOpenArtifact(path);
  const onOpenDashboard = () => onCommand('ralphCodex.showDashboard');

  const content = (() => {
    if (activeTab === 'overview') {
      return (
        <>
          {diagnosis && <FailurePanel diagnosis={diagnosis} onOpenArtifact={onOpenFailure} />}
          <AgentLanes lanes={state.agentLanes} />
          <Timeline iterations={state.recentIterations} onOpenArtifact={onOpenArtifact} />
        </>
      );
    }
    if (activeTab === 'tasks') {
      return <TaskPanel tasks={state.tasks} />;
    }
    if (activeTab === 'diagnostics') {
      return <DiagnosticsPanel diagnostics={state.diagnostics} />;
    }
    if (activeTab === 'orchestration') {
      if (!snapshot?.cost) {
        return <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--rdx-dim)', fontSize: 13 }}>
          No orchestration data yet — run a loop iteration to populate.
        </div>;
      }
      return <Orchestration cost={snapshot.cost} />;
    }
    if (activeTab === 'settings') {
      return <SettingsPanel settings={state.settingsSurface} onUpdate={onSettingUpdate} />;
    }
    return null;
  })();

  return (
    <div className="rdx-shell">
      {/* Left nav */}
      <nav className="rdx-shell-nav">
        {/* Workspace header */}
        <div style={{ padding: '10px 12px 10px', borderBottom: '1px solid var(--rdx-border)' }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--rdx-dim)', fontWeight: 600, marginBottom: 4 }}>
            Ralphdex
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <HealthPulse state={state.loopState} />
            <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state.workspaceName}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--rdx-dim)', marginTop: 1, fontFamily: 'var(--rdx-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {state.agentRole}
          </div>
        </div>

        {/* Open Dashboard */}
        <div style={{ padding: '6px 10px' }}>
          <Btn variant="secondary" size="sm" style={{ width: '100%' }} onClick={onOpenDashboard}>
            {Icon.bolt} Open Dashboard
          </Btn>
        </div>

        {/* Mode toggle */}
        <div style={{ padding: '8px 10px' }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--rdx-dim)', fontWeight: 700, margin: '4px 2px 6px' }}>
            Mode
          </div>
          <div style={{ display: 'grid', gap: 3, padding: 3, background: 'var(--rdx-surface)', borderRadius: 5, border: '1px solid var(--rdx-border)' }}>
            {MODES.map(m => {
              const active = mode === m.id;
              return (
                <button key={m.id} onClick={() => onModeChange(m.id)} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 8px', borderRadius: 4, fontFamily: 'inherit',
                  background: active ? 'var(--rdx-accent)' : 'transparent',
                  color: active ? 'var(--rdx-primary-fg)' : 'var(--rdx-fg)',
                  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
                }}>
                  <span>{m.label}</span>
                  <span style={{ fontSize: 10, opacity: 0.7 }}>{m.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab nav */}
        <nav style={{ padding: '0 6px', display: 'grid', gap: 2 }}>
          {tabs.map(t => {
            const active = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '7px 10px', borderRadius: 4, fontFamily: 'inherit', fontSize: 12,
                background: active ? 'color-mix(in srgb, var(--rdx-accent) 14%, transparent)' : 'transparent',
                color: active ? 'var(--rdx-fg)' : 'var(--rdx-dim)',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                fontWeight: active ? 600 : 400,
                borderLeft: active ? '2px solid var(--rdx-accent)' : '2px solid transparent',
              }}>
                <span style={{ color: active ? 'var(--rdx-accent)' : 'var(--rdx-dim)', display: 'flex' }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Current task sticky card */}
        {model.currentTask && (
          <div style={{ margin: '8px 10px', padding: 10, background: 'var(--rdx-surface)', borderRadius: 6, border: '1px solid var(--rdx-border)' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--rdx-dim)', fontWeight: 700, marginBottom: 5 }}>
              Current task
            </div>
            <div style={{ fontFamily: 'var(--rdx-mono)', fontSize: 11, color: 'var(--rdx-accent)', marginBottom: 3 }}>
              {model.currentTask.id}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--rdx-fg)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
              {model.currentTask.title}
            </div>
          </div>
        )}
      </nav>

      {/* Main content */}
      <main className="rdx-shell-main">
        <div className="rdx-tab-content">
          {content}
        </div>
      </main>
    </div>
  );
}

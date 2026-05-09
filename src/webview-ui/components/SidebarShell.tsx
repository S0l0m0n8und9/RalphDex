import React, { useState } from 'react';
import type { RalphDashboardState } from '../../ui/uiTypes';
import type { WebviewUiModel, DashboardMode } from '../viewModel';
import type { DiagnosisSection } from '../../webview/dashboardSnapshot';
import { HealthPulse, Icon } from './primitives/Card';
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
  { id: 'advanced', label: 'Advanced', sub: 'mission-ctrl' },
];

interface QuickActionProps { label: string; shortcut: string; onClick?: () => void }

function QuickAction({ label, shortcut, onClick }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--fg)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--dim)'; }}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '5px 8px', borderRadius: 4, fontFamily: 'inherit', fontSize: 11,
        background: 'transparent', color: 'var(--dim)', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', opacity: 0.6 }}>{shortcut}</span>
    </button>
  );
}

export function SidebarShell({ state, model, mode, onModeChange, onCommand, onSettingUpdate, onOpenArtifact }: SidebarShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const tabs = tabsForMode(mode);
  const snapshot = state.dashboardSnapshot;
  const diagnosis: DiagnosisSection | null = snapshot?.diagnosis ?? null;

  const onOpenFailure = (path: string) => onOpenArtifact(path);

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
        return <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>
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
      <aside style={{
        width: 240, flexShrink: 0, background: 'var(--sidebar)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: '12px 0', overflow: 'auto',
      }}>
        {/* Workspace header */}
        <div style={{ padding: '0 14px 10px', borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--dim)', fontWeight: 600, marginBottom: 4 }}>
            Ralphdex
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HealthPulse state={state.loopState} />
            <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state.workspaceName}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {state.agentRole}
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ padding: '0 10px', marginBottom: 14 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--dim)', fontWeight: 700, margin: '6px 4px 8px' }}>
            Mode
          </div>
          <div style={{ display: 'grid', gap: 4, padding: 3, background: 'var(--surface-2)', borderRadius: 6, border: '1px solid var(--border)' }}>
            {MODES.map(m => {
              const active = mode === m.id;
              return (
                <button key={m.id} onClick={() => onModeChange(m.id)} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 8px', borderRadius: 4, fontFamily: 'inherit',
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--rdx-primary-fg)' : 'var(--fg)',
                  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
                  textAlign: 'left',
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
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 5, fontFamily: 'inherit', fontSize: 12,
                background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
                color: active ? 'var(--fg)' : 'var(--dim)',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                fontWeight: active ? 600 : 400,
                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
              }}>
                <span style={{ color: active ? 'var(--accent)' : 'var(--dim)', display: 'flex' }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Quick actions */}
        <div style={{ padding: '0 14px', marginTop: 18 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--dim)', fontWeight: 700, margin: '6px 0 8px' }}>
            Quick actions
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <QuickAction label="Show dashboard" shortcut="⌘D" onClick={() => onCommand('ralphCodex.showDashboard')} />
            <QuickAction label="Run one iteration" shortcut="⌘⇧R" onClick={() => onCommand('ralphCodex.runIteration')} />
            <QuickAction label="Start loop" shortcut="⌘⇧L" onClick={() => onCommand('ralphCodex.runRalphLoop')} />
            <QuickAction label="Stop loop" shortcut="⌘⇧S" onClick={() => onCommand('ralphCodex.stopLoop')} />
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Current task sticky card */}
        {model.currentTask && (
          <div style={{ margin: '8px 10px 4px', padding: 12, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--dim)', fontWeight: 700, marginBottom: 6 }}>
              Current task
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', marginBottom: 4 }}>
              {model.currentTask.id}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--fg)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
              {model.currentTask.title}
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="rdx-shell-main">
        <div className="rdx-tab-content">
          {content}
        </div>
      </main>
    </div>
  );
}

import React, { useState } from 'react';
import type { RalphDashboardState } from '../../ui/uiTypes';
import type { WebviewUiModel } from '../viewModel';
import type { DiagnosisSection } from '../../webview/dashboardSnapshot';
import { HealthPulse, Icon, Btn } from './primitives/Card';
import { HeroNow } from './hero/HeroNow';
import { AgentLanes } from './panels/AgentLanes';
import { Timeline } from './panels/Timeline';
import { FailurePanel } from './panels/FailurePanel';
import { DiagnosticsPanel } from './panels/DiagnosticsPanel';
import { TaskPanel } from './tasks/TaskPanel';
import { SettingsPanel } from './SettingsPanel';
import { DeadLetter } from './panels/DeadLetter';
import { PipelineRunStrip } from './panels/PipelineRunStrip';
import { AgentGridPanel } from './panels/AgentGridPanel';
import { FailureFeedPanel } from './panels/FailureFeedPanel';
import { CostTickerPanel } from './panels/CostTickerPanel';
import { FirstRunReadiness } from './panels/FirstRunReadiness';

interface DashboardShellProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
  onCommand: (command: string) => void;
  onSettingUpdate: (key: string, value: unknown) => void;
  onOpenArtifact: (artifactDir: string) => void;
  onSeedTasks: (requestText: string) => void;
}

type TabId = 'overview' | 'tasks' | 'diagnostics' | 'settings';

interface TabDef { id: TabId; label: string; icon: React.ReactNode }

const TABS: TabDef[] = [
  { id: 'overview',     label: 'Overview',     icon: Icon.bolt  },
  { id: 'tasks',        label: 'Tasks',        icon: Icon.graph },
  { id: 'diagnostics',  label: 'Diagnostics',  icon: Icon.warn  },
  { id: 'settings',     label: 'Settings',     icon: Icon.cog   },
];

const ARTIFACT_ACTIONS: Array<{ command: string; label: string }> = [
  { command: 'ralphCodex.openLatestPipelineRun',       label: 'Latest Run Report' },
  { command: 'ralphCodex.openLatestProvenanceBundle',  label: 'Latest Provenance Bundle' },
  { command: 'ralphCodex.openLatestPromptEvidence',    label: 'Latest Prompt Evidence' },
  { command: 'ralphCodex.openLatestCliTranscript',     label: 'Latest CLI Transcript' },
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
      {shortcut && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', opacity: 0.6 }}>{shortcut}</span>}
    </button>
  );
}

function SnapshotBanner({ state }: { state: RalphDashboardState }) {
  const { phase, errorMessage } = state.snapshotStatus;
  if (phase === 'idle' || phase === 'ready') return null;

  const isError = phase === 'error';
  const color = isError ? 'var(--bad)' : 'var(--warn)';
  const bg = isError ? 'color-mix(in srgb, var(--bad) 8%, var(--surface))' : 'color-mix(in srgb, var(--warn) 8%, var(--surface))';
  const text = isError
    ? (errorMessage ?? 'Dashboard data could not be loaded')
    : phase === 'loading'
      ? 'Loading dashboard snapshot…'
      : 'Refreshing durable dashboard data…';

  return (
    <div style={{
      padding: '6px 14px', fontSize: 11, color, background: bg,
      borderBottom: `1px solid color-mix(in srgb, ${color} 30%, var(--border))`,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ display: 'flex' }}>{isError ? Icon.x : Icon.clock}</span>
      {text}
    </div>
  );
}

export function DashboardShell({ state, model, onCommand, onSettingUpdate, onOpenArtifact, onSeedTasks }: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const snapshot = state.dashboardSnapshot;
  const diagnosis: DiagnosisSection | null = snapshot?.diagnosis ?? null;
  const deadLetter = snapshot?.deadLetter ?? { entries: [] };
  const pipeline = snapshot?.pipeline ?? null;

  const onStartLoop    = () => onCommand('ralphCodex.runRalphLoop');
  const onStopLoop     = () => onCommand('ralphCodex.stopLoop');
  const onRunIteration = () => onCommand('ralphCodex.runRalphIteration');

  const content = (() => {
    if (activeTab === 'overview') {
      return (
        <>
          <HeroNow state={state} model={model}
            onStartLoop={onStartLoop} onStopLoop={onStopLoop} onRunIteration={onRunIteration} />
          {pipeline && <PipelineRunStrip pipeline={pipeline} onCommand={onCommand} />}
          {diagnosis && <FailurePanel diagnosis={diagnosis} onOpenArtifact={onOpenArtifact} onCommand={onCommand} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
            <AgentLanes lanes={state.agentLanes} />
            <Timeline iterations={state.recentIterations} onOpenArtifact={onOpenArtifact} />
          </div>
          <DeadLetter deadLetter={deadLetter} onCommand={onCommand} />
        </>
      );
    }
    if (activeTab === 'tasks') {
      return <TaskPanel tasks={state.tasks} taskSeeding={state.taskSeeding} onSeedTasks={onSeedTasks} />;
    }
    if (activeTab === 'diagnostics') {
      const checklist = snapshot?.preflight?.firstRunChecklist ?? [];
      const failureFeed = snapshot?.failureFeed ?? { entries: [] };
      const agentGrid = snapshot?.agentGrid ?? { rows: [] };
      const cost = snapshot?.cost ?? { hasAnyCostData: false, executionCostUsd: null, diagnosticCostUsd: null, promptCacheStats: null };
      return (
        <>
          <FirstRunReadiness checklist={checklist} />
          {diagnosis && <FailurePanel diagnosis={diagnosis} onOpenArtifact={onOpenArtifact} onCommand={onCommand} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
            <DiagnosticsPanel diagnostics={state.diagnostics} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '14px 16px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 10 }}>
                  Agent Controls
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Btn size="sm" variant="secondary" onClick={() => onCommand('ralphCodex.runReviewAgent')}>Review Agent</Btn>
                  <Btn size="sm" variant="secondary" onClick={() => onCommand('ralphCodex.runWatchdogAgent')}>Watchdog Agent</Btn>
                  <Btn size="sm" variant="secondary" onClick={() => onCommand('ralphCodex.runScmAgent')}>SCM Agent</Btn>
                  <Btn size="sm" variant="secondary" onClick={() => onCommand('ralphCodex.showRalphStatus')}>Show Status</Btn>
                </div>
              </div>
              <CostTickerPanel cost={cost} />
            </div>
          </div>
          <FailureFeedPanel failureFeed={failureFeed} onCommand={onCommand} />
          <AgentGridPanel agentGrid={agentGrid} onCommand={onCommand} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
            <DeadLetter deadLetter={deadLetter} onCommand={onCommand} />
            <Timeline iterations={state.recentIterations} onOpenArtifact={onOpenArtifact} />
          </div>
        </>
      );
    }
    if (activeTab === 'settings') {
      return <SettingsPanel settings={state.settingsSurface} onUpdate={onSettingUpdate} onOpenVsCodeSettings={() => onCommand('ralphCodex.openSettings')} onCommand={onCommand} />;
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

        {/* Tab nav */}
        <nav style={{ padding: '0 6px', display: 'grid', gap: 2 }}>
          {TABS.map(t => {
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
            <QuickAction label="Run one iteration" shortcut="⌘⇧R" onClick={() => onCommand('ralphCodex.runRalphIteration')} />
            <QuickAction label="Start loop"        shortcut="⌘⇧L" onClick={() => onCommand('ralphCodex.runRalphLoop')} />
            <QuickAction label="Stop loop"         shortcut="⌘⇧S" onClick={() => onCommand('ralphCodex.stopLoop')} />
            <QuickAction label="Seed from epic"    shortcut=""     onClick={() => setActiveTab('tasks')} />
            <QuickAction label="Prepare IDE Prompt" shortcut=""   onClick={() => onCommand('ralphCodex.generatePrompt')} />
            <QuickAction label="Show Status"        shortcut=""   onClick={() => onCommand('ralphCodex.showRalphStatus')} />
            <QuickAction label="Open Tasks"         shortcut=""   onClick={() => onCommand('ralphCodex.showTasks')} />
            <QuickAction label="Open settings"      shortcut=""   onClick={() => onCommand('ralphCodex.openSettings')} />
          </div>
        </div>

        {/* Artifact links */}
        <div style={{ padding: '0 14px', marginTop: 14 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--dim)', fontWeight: 700, margin: '6px 0 8px' }}>
            Inspect
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {ARTIFACT_ACTIONS.map(a => (
              <QuickAction key={a.command} label={a.label} shortcut="" onClick={() => onCommand(a.command)} />
            ))}
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
        <SnapshotBanner state={state} />
        <div className="rdx-tab-content">
          {content}
        </div>
      </main>
    </div>
  );
}

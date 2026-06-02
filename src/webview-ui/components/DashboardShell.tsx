import React, { useEffect, useRef, useState } from 'react';
import type { RalphDashboardState, RalphDoctrineProposalActionPayload, RalphWebviewMessage } from '../../ui/uiTypes';
import type { WebviewUiModel } from '../viewModel';
import type { DashboardDoctrineSection, DiagnosisSection } from '../../webview/dashboardSnapshot';
import { HealthPulse, Icon, Btn, Card, StatusPill } from './primitives/Card';
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
import { DoctrineCard } from './panels/DoctrineCard';
import { DoctrineProposalReviewPanel } from './panels/DoctrineProposalReviewPanel';
import { RunTimelinePanel } from './panels/RunTimelinePanel';

interface DashboardShellProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
  onCommand: (command: string) => void;
  onSettingUpdate: (key: string, value: unknown) => void;
  onActiveTabChange?: (activeTab: TabId) => void;
  onOpenArtifact: (artifactDir: string) => void;
  onSeedTasks: (requestText: string) => void;
  onDoctrineAction: (action: RalphDoctrineProposalActionPayload) => void;
  lastDoctrineActionResult: Extract<RalphWebviewMessage, { type: 'doctrine-proposal-action-result' }> | null;
}

type TabId = 'overview' | 'tasks' | 'diagnostics' | 'doctrine' | 'settings';

interface TabDef { id: TabId; label: string; icon: React.ReactNode }

const TABS: TabDef[] = [
  { id: 'overview',     label: 'Overview',     icon: Icon.bolt  },
  { id: 'tasks',        label: 'Tasks',        icon: Icon.graph },
  { id: 'diagnostics',  label: 'Diagnostics',  icon: Icon.warn  },
  { id: 'doctrine',     label: 'Doctrine',     icon: Icon.ask   },
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

function mapIntentTabToTabId(activeTab: string | null | undefined): TabId | null {
  if (activeTab === 'work') return 'tasks';
  if (activeTab === 'overview' || activeTab === 'tasks' || activeTab === 'diagnostics' || activeTab === 'doctrine' || activeTab === 'settings') {
    return activeTab;
  }
  return null;
}

const ACTIVE_TAB_STORAGE_KEY = 'ralphdex.dashboard.activeTab';

function readPersistedDashboardTab(): TabId | null {
  try {
    const storage = typeof window === 'undefined' ? null : window.sessionStorage;
    return mapIntentTabToTabId(storage?.getItem(ACTIVE_TAB_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

function persistDashboardTab(activeTab: TabId): void {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    }
  } catch {
    // Storage can be unavailable in restricted webview/test contexts.
  }
}

export function resolveInitialDashboardTab(
  viewIntent: RalphDashboardState['viewIntent'],
  readPersisted: () => TabId | null = readPersistedDashboardTab
): TabId {
  return mapIntentTabToTabId(viewIntent?.activeTab ?? null) ?? readPersisted() ?? 'overview';
}

export function reconcileDashboardTabIntent(
  currentTab: TabId,
  viewIntent: RalphDashboardState['viewIntent'],
  previousAppliedIntent: string | null
): { nextTab: TabId; appliedIntent: string | null; shouldPersist: boolean } {
  const rawIntent = viewIntent?.activeTab ?? null;
  if (rawIntent === previousAppliedIntent) {
    return { nextTab: currentTab, appliedIntent: previousAppliedIntent, shouldPersist: false };
  }

  const intentTab = mapIntentTabToTabId(rawIntent);
  if (!intentTab) {
    return { nextTab: currentTab, appliedIntent: rawIntent, shouldPersist: false };
  }

  return {
    nextTab: intentTab,
    appliedIntent: rawIntent,
    shouldPersist: intentTab !== currentTab
  };
}

function doctrineHighestPendingRisk(doctrine: DashboardDoctrineSection): 'high' | 'medium' | 'low' | 'none' {
  if (doctrine.pendingProposalCountsByRisk.high > 0) return 'high';
  if (doctrine.pendingProposalCountsByRisk.medium > 0) return 'medium';
  if (doctrine.pendingProposalCountsByRisk.low > 0) return 'low';
  return 'none';
}

function doctrineNeedsAttention(doctrine: DashboardDoctrineSection): boolean {
  return doctrine.health !== 'healthy'
    || doctrine.contextTruncated
    || doctrine.pendingProposalCountsByRisk.total > 0
    || doctrine.pendingProposalCountsByRisk.high > 0;
}

function doctrineNeedsDiagnosticsAttention(
  doctrine: DashboardDoctrineSection | null,
  lastDoctrineActionResult: Extract<RalphWebviewMessage, { type: 'doctrine-proposal-action-result' }> | null
): boolean {
  if (!doctrine) return false;
  const malformedProposalArtifact = doctrine.diagnostics.other.some((diagnostic) => diagnostic.code === 'doctrine_proposal_artifact_invalid');
  const proposalAttention = doctrine.pendingProposalCountsByRisk.high > 0 || doctrine.proposalReview.proposals.some((proposal) => proposal.protectedTarget);
  const actionFailed = lastDoctrineActionResult?.status === 'error';
  return doctrine.health !== 'healthy' || malformedProposalArtifact || proposalAttention || actionFailed;
}

function DoctrineOverviewStatusCard({ doctrine, onOpenDoctrineTab }: { doctrine: DashboardDoctrineSection | null; onOpenDoctrineTab: () => void }) {
  if (!doctrine) return null;
  const pending = doctrine.pendingProposalCountsByRisk.total;
  const highestRisk = doctrineHighestPendingRisk(doctrine);
  const needsAttention = doctrineNeedsAttention(doctrine);

  return (
    <Card
      title="Doctrine Status"
      subtitle={needsAttention
        ? 'Doctrine needs operator attention. Review full details in the Doctrine tab.'
        : 'Doctrine is healthy. Full governance and proposal review is available in the Doctrine tab.'}
      style={needsAttention
        ? {
          borderColor: 'color-mix(in srgb, var(--warn) 45%, var(--border))',
          borderTop: '2px solid var(--warn)',
          background: 'color-mix(in srgb, var(--warn) 6%, var(--surface))'
        }
        : undefined}
    >
      <div style={{ display: 'grid', gap: 10 }} data-testid="doctrine-overview-status">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill kind={doctrine.health === 'healthy' ? 'ok' : 'warn'}>health: {doctrine.health.replace(/_/g, ' ')}</StatusPill>
          <StatusPill kind={doctrine.contextTruncated ? 'warn' : 'neutral'}>
            context: {doctrine.contextBudget.usedChars}/{doctrine.contextBudget.budgetChars} chars ({doctrine.contextBudget.usagePercent}%)
          </StatusPill>
          <StatusPill kind={pending > 0 ? 'warn' : 'ok'}>pending: {pending}</StatusPill>
          <StatusPill kind={highestRisk === 'high' ? 'bad' : highestRisk === 'medium' ? 'warn' : 'neutral'}>
            highest risk: {highestRisk}
          </StatusPill>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>
            {needsAttention ? 'Attention required. Full proposal details are in Doctrine.' : 'No doctrine attention required right now.'}
          </span>
          <Btn size="sm" variant={needsAttention ? 'primary' : 'secondary'} onClick={onOpenDoctrineTab}>
            Open Doctrine Tab
          </Btn>
        </div>
      </div>
    </Card>
  );
}

export function DashboardShell({ state, model, onCommand, onSettingUpdate, onActiveTabChange, onOpenArtifact, onSeedTasks, onDoctrineAction, lastDoctrineActionResult }: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>(() => resolveInitialDashboardTab(state.viewIntent));
  const appliedIntentRef = useRef<string | null>(state.viewIntent?.activeTab ?? null);
  const snapshot = state.dashboardSnapshot;
  const diagnosis: DiagnosisSection | null = snapshot?.diagnosis ?? null;
  const deadLetter = snapshot?.deadLetter ?? { entries: [] };
  const pipeline = snapshot?.pipeline ?? null;
  const doctrine = snapshot?.doctrine ?? null;
  const runTimeline = snapshot?.runTimeline ?? null;
  const showDoctrineDiagnostics = doctrineNeedsDiagnosticsAttention(doctrine, lastDoctrineActionResult);

  useEffect(() => {
    const update = reconcileDashboardTabIntent(activeTab, state.viewIntent, appliedIntentRef.current);
    appliedIntentRef.current = update.appliedIntent;
    if (update.shouldPersist) {
      persistDashboardTab(update.nextTab);
    }
    if (update.nextTab !== activeTab) {
      setActiveTab(update.nextTab);
    }
  }, [activeTab, state.viewIntent?.activeTab]);

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    persistDashboardTab(tab);
    onActiveTabChange?.(tab);
  };

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
          <DoctrineOverviewStatusCard doctrine={doctrine} onOpenDoctrineTab={() => selectTab('doctrine')} />
          {diagnosis && <FailurePanel diagnosis={diagnosis} onOpenArtifact={onOpenArtifact} onCommand={onCommand} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
            <AgentLanes lanes={state.agentLanes} />
            <Timeline iterations={state.recentIterations} onOpenArtifact={onOpenArtifact} />
          </div>
          {runTimeline && <RunTimelinePanel runTimeline={runTimeline} />}
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
          {showDoctrineDiagnostics && (
            <>
              <DoctrineOverviewStatusCard doctrine={doctrine} onOpenDoctrineTab={() => selectTab('doctrine')} />
              <DoctrineCard doctrine={doctrine} onCommand={onCommand} />
            </>
          )}
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
    if (activeTab === 'doctrine') {
      return (
        <>
          <DoctrineCard doctrine={doctrine} onCommand={onCommand} />
          {doctrine && <DoctrineProposalReviewPanel review={doctrine.proposalReview} onDoctrineAction={onDoctrineAction} lastActionResult={lastDoctrineActionResult} />}
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
              <button key={t.id} onClick={() => selectTab(t.id)} style={{
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
            <QuickAction label="Seed from epic"    shortcut=""     onClick={() => selectTab('tasks')} />
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

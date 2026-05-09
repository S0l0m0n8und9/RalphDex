import React from 'react';
import type { RalphDashboardState } from '../../ui/uiTypes';
import type { WebviewUiModel } from '../viewModel';
import { HealthPulse, StatusPill, Btn, Icon } from './primitives/Card';

interface SidebarShellProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
  onCommand: (command: string) => void;
}

export function SidebarShell({ state, model, onCommand }: SidebarShellProps) {
  const running = state.loopState === 'running';
  const loopKind = running ? 'running' : state.loopState === 'stopped' ? 'stopped' : 'idle';
  const loopLabel = running ? 'Loop running' : state.loopState === 'stopped' ? 'Loop stopped' : 'Loop idle';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: 12, background: 'var(--sidebar)', minHeight: '100vh',
      fontFamily: 'var(--rdx-font)', color: 'var(--fg)',
    }}>
      {/* Workspace identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <HealthPulse state={state.loopState} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {state.workspaceName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {state.agentRole}
          </div>
        </div>
      </div>

      {/* Loop status */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <StatusPill kind={loopKind} small>{loopLabel}</StatusPill>
        {running && state.nextIteration > 0 && (
          <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
            iter <b style={{ color: 'var(--fg)' }}>{state.nextIteration}</b> / {state.iterationCap}
          </div>
        )}
        {model.currentTask && (
          <div style={{ fontSize: 11, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{model.currentTask.id}</span>
            {' '}{model.currentTask.title}
          </div>
        )}
      </div>

      {/* Open dashboard */}
      <Btn variant="primary" size="sm" style={{ width: '100%', justifyContent: 'center' }}
        onClick={() => onCommand('ralphCodex.showDashboard')}>
        {Icon.bolt} Open Dashboard
      </Btn>

      {/* Quick loop controls */}
      <div style={{ display: 'grid', gap: 4 }}>
        {running ? (
          <Btn variant="secondary" size="sm" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => onCommand('ralphCodex.stopLoop')}>
            {Icon.stop} Stop loop
          </Btn>
        ) : (
          <Btn variant="secondary" size="sm" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => onCommand('ralphCodex.runRalphLoop')}>
            {Icon.play} Start loop
          </Btn>
        )}
        <Btn variant="ghost" size="sm" style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => onCommand('ralphCodex.runIteration')}>
          {Icon.bolt} Run one iteration
        </Btn>
      </div>
    </div>
  );
}

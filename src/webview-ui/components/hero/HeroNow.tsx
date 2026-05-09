import React from 'react';
import type { RalphDashboardState } from '../../../ui/uiTypes';
import type { WebviewUiModel, DashboardMode } from '../../viewModel';
import { Card, StatusPill, Btn, HealthPulse, Icon, formatBytes } from '../primitives/Card';
import { PhaseTracker } from './PhaseTracker';
import { HealthCell } from './HealthCell';

interface HeroNowProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
  mode: DashboardMode;
  onStartLoop: () => void;
  onStopLoop: () => void;
  onRunIteration: () => void;
}

export function HeroNow({ state, model, mode, onStartLoop, onStopLoop, onRunIteration }: HeroNowProps) {
  const running = state.loopState === 'running';
  const total   = model.taskTotal;
  const done    = model.doneCount;
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
  const iterPct = state.iterationCap > 0 ? Math.round((state.nextIteration / state.iterationCap) * 100) : 0;
  const attention = state.taskCounts?.blocked ?? 0;
  const snapshot  = state.dashboardSnapshot;
  const cacheStats = snapshot?.cost.promptCacheStats ?? null;

  const loopPillKind = running ? 'running' : state.loopState === 'stopped' ? 'stopped' : 'idle';

  return (
    <Card accent padding="18px 20px" style={{ gap: 14 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Left: status + task info */}
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <HealthPulse state={state.loopState} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--rdx-dim)' }}>
              Now
            </span>
            <StatusPill kind={loopPillKind} small>
              {running ? 'Loop running' : state.loopState === 'stopped' ? 'Loop stopped' : 'Loop idle'}
            </StatusPill>
            {running && (
              <span style={{ fontSize: 11, color: 'var(--rdx-dim)' }}>
                iteration <b style={{ color: 'var(--rdx-fg)', fontFamily: 'var(--rdx-mono)' }}>{state.nextIteration}</b> / {state.iterationCap}
              </span>
            )}
          </div>

          {mode === 'simple' ? (
            <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: 'var(--rdx-fg)' }}>
              {model.readiness.detail}
            </p>
          ) : (
            <>
              {model.currentTask ? (
                <>
                  <div style={{ fontSize: 11, color: 'var(--rdx-dim)', marginBottom: 4 }}>Current task</div>
                  <div style={{
                    display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap',
                    fontSize: 15, fontWeight: 500, lineHeight: 1.3, marginBottom: 10,
                  }}>
                    <span style={{
                      fontFamily: 'var(--rdx-mono)', fontSize: 11,
                      padding: '2px 7px', background: 'var(--rdx-surface-2)',
                      border: '1px solid var(--rdx-border)', borderRadius: 4,
                      color: 'var(--rdx-accent)',
                    }}>
                      {model.currentTask.id}
                    </span>
                    <span>{model.currentTask.title}</span>
                  </div>
                  {state.agentLanes[0]?.phase != null && (
                    <PhaseTracker phase={state.agentLanes[0].phase} />
                  )}
                </>
              ) : (
                <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: 'var(--rdx-dim)' }}>
                  {model.readiness.detail}
                </p>
              )}
            </>
          )}
        </div>

        {/* Right: action buttons */}
        <div style={{ display: 'flex', gap: 7, flexShrink: 0, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {running ? (
            <Btn variant="danger" size="md" onClick={onStopLoop}>{Icon.stop} Stop loop</Btn>
          ) : (
            <Btn variant="primary" size="md" onClick={onStartLoop}>{Icon.play} Start loop</Btn>
          )}
          {mode !== 'simple' && (
            <Btn variant="secondary" size="md" onClick={onRunIteration}>
              {Icon.bolt} Run one iteration
            </Btn>
          )}
        </div>
      </div>

      {/* Health strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cacheStats ? 4 : 3}, minmax(120px, 1fr))`,
        border: '1px solid var(--rdx-border)', borderRadius: 6,
        overflow: 'hidden', background: 'var(--rdx-surface-2)',
      }}>
        <HealthCell
          label="Progress"
          value={`${done}/${total}`}
          sub={`${donePct}% done`}
          bar={donePct}
          barColor="var(--rdx-ok)"
        />
        <HealthCell
          label="Iteration"
          value={`${state.nextIteration}/${state.iterationCap}`}
          sub={`${iterPct}% of cap`}
          bar={iterPct}
        />
        <HealthCell
          label="Attention"
          value={String(attention)}
          sub={attention === 0 ? 'all clear' : `${attention} blocked`}
          tone={attention > 0 ? 'warn' : 'ok'}
        />
        {cacheStats && (
          <HealthCell
            label="Cache"
            value={formatBytes(cacheStats.staticPrefixBytes)}
            sub={
              cacheStats.cacheHit === null ? 'no cache data' :
              cacheStats.cacheHit ? 'cache hit' : 'cache miss'
            }
            tone={cacheStats.cacheHit === true ? 'ok' : 'neutral'}
          />
        )}
      </div>
    </Card>
  );
}

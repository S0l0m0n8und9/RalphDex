import React from 'react';
import type { RalphDashboardState } from '../../../ui/uiTypes';
import type { WebviewUiModel } from '../../viewModel';
import { Card, StatusPill, Btn, HealthPulse, Icon, formatBytes } from '../primitives/Card';
import { PhaseTracker } from './PhaseTracker';
import { HealthCell } from './HealthCell';

interface HeroNowProps {
  state: RalphDashboardState;
  model: WebviewUiModel;
  onStartLoop: () => void;
  onStopLoop: () => void;
  onRunIteration: () => void;
}

export function HeroNow({ state, model, onStartLoop, onStopLoop, onRunIteration }: HeroNowProps) {
  const running  = state.loopState === 'running';
  const total    = model.taskTotal;
  const done     = model.doneCount;
  const donePct  = total > 0 ? Math.round((done / total) * 100) : 0;
  const iterPct  = state.iterationCap > 0 ? Math.round((state.nextIteration / state.iterationCap) * 100) : 0;
  const attention = state.taskCounts?.blocked ?? 0;
  const deadLetterCount = state.dashboardSnapshot?.deadLetter.entries.length ?? 0;
  const snapshot  = state.dashboardSnapshot;
  const cacheStats = snapshot?.cost.promptCacheStats ?? null;
  const executionCost = snapshot?.cost.executionCostUsd ?? null;

  const loopPillKind = running ? 'running' : state.loopState === 'stopped' ? 'stopped' : 'idle';

  const primaryExplain = running
    ? `Ralph is working on iteration ${state.nextIteration} of ${state.iterationCap}.`
    : `Ralph is idle. ${done} of ${total} tasks done.`;

  return (
    <Card accent padding="20px 22px" style={{ gap: 16 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <HealthPulse state={state.loopState} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--dim)' }}>
              Now
            </span>
            <StatusPill kind={loopPillKind} small>
              {running ? 'Loop running' : state.loopState === 'stopped' ? 'Loop stopped' : 'Loop idle'}
            </StatusPill>
            {running && (
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>
                iteration <b style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>{state.nextIteration}</b> / {state.iterationCap}
              </span>
            )}
          </div>

          {model.currentTask ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 4 }}>Current task</div>
              <h2 style={{
                fontSize: 19, fontWeight: 500, lineHeight: 1.3, margin: '0 0 10px 0',
                letterSpacing: -0.2, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap',
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12, padding: '3px 8px',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 4, color: 'var(--accent)',
                }}>
                  {model.currentTask.id}
                </span>
                <span>{model.currentTask.title}</span>
              </h2>
              {state.agentLanes[0]?.phase != null && (
                <PhaseTracker phase={state.agentLanes[0].phase} />
              )}
            </>
          ) : (
            <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: 'var(--dim)' }}>
              {model.readiness.detail}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {running ? (
            <Btn variant="danger" size="md" onClick={onStopLoop}>{Icon.stop} Stop loop</Btn>
          ) : (
            <Btn variant="primary" size="md" onClick={onStartLoop}>{Icon.play} Start loop</Btn>
          )}
          <Btn variant="secondary" size="md" onClick={onRunIteration}>
            {Icon.bolt} Run one iteration
          </Btn>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        border: '1px solid var(--border)', borderRadius: 8,
        overflow: 'hidden', background: 'var(--surface-2)',
      }}>
        <HealthCell
          label="Progress"
          value={`${done}/${total}`}
          sub={`${donePct}% done`}
          bar={donePct}
          barColor="var(--ok)"
        />
        <HealthCell
          label="Iteration"
          value={`${state.nextIteration}/${state.iterationCap}`}
          sub={`${iterPct}% of cap`}
          bar={iterPct}
        />
        <HealthCell
          label="Attention"
          value={String(attention + deadLetterCount)}
          sub={
            attention === 0 && deadLetterCount === 0
              ? 'all clear'
              : [attention > 0 && `${attention} blocked`, deadLetterCount > 0 && `${deadLetterCount} dead-letter`].filter(Boolean).join(' · ')
          }
          tone={attention + deadLetterCount > 0 ? 'warn' : 'ok'}
        />
        {executionCost !== null ? (
          <HealthCell
            label="Last iteration"
            value={`$${executionCost.toFixed(3)}`}
            sub={snapshot?.cost.diagnosticCostUsd != null ? `+$${snapshot.cost.diagnosticCostUsd.toFixed(3)} diag` : 'execution cost'}
          />
        ) : cacheStats ? (
          <HealthCell
            label="Cache"
            value={formatBytes(cacheStats.staticPrefixBytes)}
            sub={
              cacheStats.cacheHit === null ? 'no data' :
              cacheStats.cacheHit ? 'cache hit' : 'cache miss'
            }
            tone={cacheStats.cacheHit === true ? 'ok' : 'neutral'}
          />
        ) : null}
      </div>
    </Card>
  );
}

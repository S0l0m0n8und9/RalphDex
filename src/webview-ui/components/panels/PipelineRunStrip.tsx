import React from 'react';
import type { DashboardPipelineSection } from '../../../webview/dashboardSnapshot';
import { Card, StatusPill, Btn, Icon } from '../primitives/Card';

interface PipelineRunStripProps {
  pipeline: DashboardPipelineSection;
  onCommand: (command: string) => void;
}

const PHASE_ORDER = ['scaffold', 'loop', 'review', 'scm', 'done'];

function phasePct(phase: string | null): number {
  if (!phase) return 0;
  const idx = PHASE_ORDER.indexOf(phase);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / PHASE_ORDER.length) * 100);
}

export function PipelineRunStrip({ pipeline, onCommand }: PipelineRunStripProps) {
  const run = pipeline.latestRun;
  if (!run) return null;
  if (run.status !== 'running') return null;

  const stateColor = 'var(--ok)';
  const pct = phasePct(run.phase);
  const activeNode = pipeline.orchestration?.activeNodeLabel ?? run.phase ?? 'working';
  const decomposed = run.decomposedTaskIds.length;

  return (
    <Card padding="14px 16px" style={{ borderLeft: `3px solid ${stateColor}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--dim)', fontWeight: 600 }}>
              Active Pipeline
            </span>
            <StatusPill kind="running" small>running</StatusPill>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>
              {run.rootTaskId}
            </span>
            {decomposed > 0 && (
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>
                {decomposed} task{decomposed === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) auto', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--dim)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
                <span style={{ textTransform: 'capitalize' }}>{activeNode}</span>
                <span>{pct}%</span>
              </div>
              <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: stateColor, transition: 'width 0.3s' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              {PHASE_ORDER.map(p => (
                <span key={p} style={{
                  color: run.phase === p ? 'var(--ok)' : PHASE_ORDER.indexOf(p) < PHASE_ORDER.indexOf(run.phase ?? '') ? 'var(--fg)' : 'var(--border)',
                  fontWeight: run.phase === p ? 600 : 400,
                }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Btn size="sm" variant="secondary" onClick={() => onCommand('ralphCodex.openLatestPipelineRun')}>
            {Icon.arrow} Open run
          </Btn>
        </div>
      </div>
    </Card>
  );
}

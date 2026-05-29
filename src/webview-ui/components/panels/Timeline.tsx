import React from 'react';
import type { RalphDashboardIteration } from '../../../ui/uiTypes';
import type { RalphCompletionClassification } from '../../../ralph/types';
import { describeStopReason } from '../../../ralph/stopReasonPresentation';
import { Card } from '../primitives/Card';

interface TimelineProps {
  iterations: RalphDashboardIteration[];
  onOpenArtifact: (artifactDir: string) => void;
}

const CLASS_COLOR: Record<RalphCompletionClassification, string> = {
  complete:             'var(--ok)',
  already_satisfied:    'var(--ok)',
  partial_progress:     'var(--accent)',
  no_progress:          'var(--dim)',
  blocked:              'var(--warn)',
  failed:               'var(--bad)',
  needs_human_review:   'var(--cyan)',
};

export function Timeline({ iterations, onOpenArtifact }: TimelineProps) {
  if (iterations.length === 0) return null;
  return (
    <Card title="Iteration Timeline" subtitle="Most recent first · click to inspect artifact">
      <div style={{ display: 'grid', gap: 4 }}>
        {iterations.map(it => {
          const color = CLASS_COLOR[it.classification] ?? 'var(--dim)';
          return (
            <button
              key={it.iteration}
              onClick={() => onOpenArtifact(it.artifactDir)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              style={{
                display: 'grid',
                gridTemplateColumns: '28px 60px 70px 1fr 70px 60px',
                gap: 8, alignItems: 'center',
                padding: '8px 10px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontFamily: 'inherit', color: 'var(--fg)',
                cursor: 'pointer', textAlign: 'left', fontSize: 12,
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--dim)', fontSize: 11 }}>
                #{it.iteration}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--dim)' }}>
                {it.agentId ?? '—'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.taskId ?? '—'}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color, fontSize: 12, fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {it.classification.replace(/_/g, ' ')}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--dim)' }}>
                {it.effectiveTier ?? ''}
              </span>
              <span
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--dim)', textAlign: 'right' }}
                title={it.stopReason ? `${describeStopReason(it.stopReason).explanation}\n\nNext: ${describeStopReason(it.stopReason).nextAction}` : undefined}
              >
                {it.stopReason ? describeStopReason(it.stopReason).label : ''}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

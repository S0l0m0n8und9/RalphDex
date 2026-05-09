import React from 'react';
import type { RalphDashboardIteration } from '../../../ui/uiTypes';
import type { RalphCompletionClassification } from '../../../ralph/types';
import { Card } from '../primitives/Card';

interface TimelineProps {
  iterations: RalphDashboardIteration[];
  onOpenArtifact: (artifactDir: string) => void;
}

const CLASS_COLOR: Record<RalphCompletionClassification, string> = {
  complete:             'var(--rdx-ok)',
  already_satisfied:    'var(--rdx-ok)',
  partial_progress:     'var(--rdx-accent)',
  no_progress:          'var(--rdx-dim)',
  blocked:              'var(--rdx-warn)',
  failed:               'var(--rdx-bad)',
  needs_human_review:   'var(--rdx-cyan)',
};

export function Timeline({ iterations, onOpenArtifact }: TimelineProps) {
  if (iterations.length === 0) return null;
  return (
    <Card title="Iteration Timeline" subtitle="Most recent first · click row to inspect artifact">
      <div style={{ display: 'grid', gap: 3 }}>
        {iterations.map(it => {
          const color = CLASS_COLOR[it.classification] ?? 'var(--rdx-dim)';
          return (
            <button
              key={it.iteration}
              onClick={() => onOpenArtifact(it.artifactDir)}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 60px minmax(0,1fr) 120px 70px',
                gap: 8, alignItems: 'center',
                padding: '7px 10px',
                background: 'var(--rdx-surface-2)',
                border: '1px solid var(--rdx-border)',
                borderRadius: 5,
                fontFamily: 'inherit', color: 'var(--rdx-fg)',
                cursor: 'pointer', textAlign: 'left', fontSize: 12,
              }}
            >
              <span style={{ fontFamily: 'var(--rdx-mono)', color: 'var(--rdx-dim)', fontSize: 11 }}>
                #{it.iteration}
              </span>
              <span style={{ fontFamily: 'var(--rdx-mono)', fontSize: 11, color: 'var(--rdx-accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.taskId ?? '—'}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                color, fontSize: 12, fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {it.classification.replace(/_/g, ' ')}
              </span>
              <span style={{ fontFamily: 'var(--rdx-mono)', fontSize: 11, color: 'var(--rdx-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.stopReason ? it.stopReason.replace(/_/g, ' ') : ''}
              </span>
              <span style={{ fontFamily: 'var(--rdx-mono)', fontSize: 11, color: 'var(--rdx-dim)', textAlign: 'right' }}>
                {it.agentId ?? ''}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

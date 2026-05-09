import React from 'react';
import type { DiagnosisSection } from '../../../webview/dashboardSnapshot';
import { Card, StatusPill, Btn, Icon } from '../primitives/Card';

interface FailurePanelProps {
  diagnosis: DiagnosisSection;
  onOpenArtifact: (path: string) => void;
}

export function FailurePanel({ diagnosis: d, onOpenArtifact }: FailurePanelProps) {
  const confidenceKind = d.confidence === 'high' ? 'bad' : d.confidence === 'medium' ? 'warn' : 'neutral';
  return (
    <Card padding="14px 16px" style={{
      borderColor: 'color-mix(in srgb, var(--rdx-bad) 40%, var(--rdx-border))',
      background: 'color-mix(in srgb, var(--rdx-bad) 4%, var(--rdx-surface))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: 'var(--rdx-bad)', display: 'flex' }}>{Icon.warn}</span>
        <h3 style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--rdx-bad)', margin: 0, flex: 1 }}>
          Needs Attention · Failure Diagnosis
        </h3>
        <StatusPill kind={confidenceKind} small>{d.confidence} confidence</StatusPill>
      </div>

      <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--rdx-mono)', fontSize: 11, padding: '2px 6px',
          background: 'var(--rdx-surface-2)', border: '1px solid var(--rdx-border)',
          borderRadius: 3, color: 'var(--rdx-accent)',
        }}>
          {d.taskId}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{d.taskTitle}</span>
        {d.recoveryAttemptCount != null && d.recoveryAttemptCount > 0 && (
          <span style={{ fontSize: 11, color: 'var(--rdx-dim)', marginLeft: 'auto' }}>
            attempt {d.recoveryAttemptCount} · <b style={{ color: 'var(--rdx-fg)' }}>{d.category.replace(/_/g, ' ')}</b>
          </span>
        )}
      </div>

      <div style={{
        background: 'var(--rdx-surface-2)', border: '1px solid var(--rdx-border)',
        borderRadius: 5, padding: '10px 12px', marginBottom: 8,
      }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--rdx-dim)', fontWeight: 600, marginBottom: 4 }}>
          What went wrong
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>{d.summary}</p>
      </div>

      <div style={{
        border: '1px solid color-mix(in srgb, var(--rdx-accent) 35%, transparent)',
        background: 'color-mix(in srgb, var(--rdx-accent) 6%, transparent)',
        borderRadius: 5, padding: '10px 12px', marginBottom: 10,
      }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--rdx-accent)', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
          {Icon.bolt} Suggested fix
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>{d.suggestedAction}</p>
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {d.failureAnalysisPath && (
          <Btn size="sm" variant="secondary" onClick={() => onOpenArtifact(d.failureAnalysisPath!)}>
            Open failure artifact
          </Btn>
        )}
      </div>
    </Card>
  );
}

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
    <Card padding="16px 18px" style={{
      borderColor: 'color-mix(in srgb, var(--bad) 40%, var(--border))',
      background: 'color-mix(in srgb, var(--bad) 4%, var(--surface))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ color: 'var(--bad)', display: 'flex' }}>{Icon.warn}</span>
        <h3 style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--bad)', margin: 0, flex: 1 }}>
          NEEDS ATTENTION · FAILURE DIAGNOSIS
        </h3>
        <StatusPill kind={confidenceKind} small>{d.confidence} confidence</StatusPill>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 6px',
          background: 'var(--surface-2)', borderRadius: 3, color: 'var(--accent)',
        }}>
          {d.taskId}
        </span>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{d.taskTitle}</span>
        <span style={{ flex: 1 }} />
        {d.recoveryAttemptCount != null && d.recoveryAttemptCount > 0 && (
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>
            attempt {d.recoveryAttemptCount} · category <b style={{ color: 'var(--fg)' }}>{d.category.replace(/_/g, ' ')}</b>
          </span>
        )}
      </div>

      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 6, padding: 12, marginTop: 6, marginBottom: 10,
      }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--dim)', fontWeight: 600, marginBottom: 4 }}>
          What went wrong
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, color: 'var(--fg)' }}>{d.summary}</p>
      </div>

      <div style={{
        border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
        background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
        borderRadius: 6, padding: 12, marginBottom: 12,
      }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--accent)', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          {Icon.bolt} Suggested fix
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, color: 'var(--fg)' }}>{d.suggestedAction}</p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {d.failureAnalysisPath && (
          <Btn size="sm" variant="secondary" onClick={() => onOpenArtifact(d.failureAnalysisPath!)}>
            Open failure artifact
          </Btn>
        )}
      </div>
    </Card>
  );
}

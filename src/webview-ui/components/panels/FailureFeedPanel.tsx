import React from 'react';
import type { FailureFeedSection } from '../../../webview/dashboardSnapshot';
import { Card, StatusPill, Btn } from '../primitives/Card';

interface FailureFeedPanelProps {
  failureFeed: FailureFeedSection;
  onCommand: (command: string) => void;
}

export function FailureFeedPanel({ failureFeed, onCommand }: FailureFeedPanelProps) {
  const { entries } = failureFeed;

  if (entries.length === 0) {
    return (
      <Card title="Failure Feed">
        <p style={{ fontSize: 12, color: 'var(--dim)', margin: 0 }}>No failures recorded for recent iterations.</p>
      </Card>
    );
  }

  return (
    <Card title="Failure Feed">
      <div style={{ display: 'grid', gap: 8 }}>
        {entries.map((entry, i) => {
          const confidenceKind = entry.confidence === 'high' ? 'bad' : entry.confidence === 'medium' ? 'warn' : 'neutral';
          return (
            <div key={`${entry.taskId}-${i}`} style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 6, padding: 10,
              borderLeft: '3px solid color-mix(in srgb, var(--bad) 60%, transparent)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>{entry.taskId}</span>
                <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.taskTitle}</span>
                <StatusPill kind={confidenceKind} small>{entry.confidence}</StatusPill>
              </div>
              <p style={{ fontSize: 12, color: 'var(--fg)', margin: '4px 0', lineHeight: 1.5 }}>{entry.summary}</p>
              {entry.remediationSummary && (
                <p style={{ fontSize: 11, color: 'var(--dim)', margin: '4px 0 8px', lineHeight: 1.4, fontStyle: 'italic' }}>
                  Remediation: {entry.remediationSummary}
                </p>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <Btn size="sm" variant="secondary" onClick={() => onCommand('ralphCodex.openFailureDiagnosis')}>View Diagnosis</Btn>
                <Btn size="sm" variant="secondary" onClick={() => onCommand('ralphCodex.autoRecoverTask')}>Auto-Recover</Btn>
                <Btn size="sm" variant="secondary" onClick={() => onCommand('ralphCodex.skipTask')}>Skip Task</Btn>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

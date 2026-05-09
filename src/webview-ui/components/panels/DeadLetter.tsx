import React from 'react';
import type { DeadLetterSection } from '../../../webview/dashboardSnapshot';
import { Card, Btn, Icon } from '../primitives/Card';

interface DeadLetterProps {
  deadLetter: DeadLetterSection;
  onCommand: (command: string) => void;
}

export function DeadLetter({ deadLetter, onCommand }: DeadLetterProps) {
  if (deadLetter.entries.length === 0) return null;

  return (
    <Card padding="14px 16px" style={{ borderColor: 'color-mix(in srgb, var(--warn) 35%, var(--border))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: 'var(--warn)', display: 'flex' }}>{Icon.skull}</span>
        <h3 style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase',
          color: 'var(--warn)', margin: 0, flex: 1,
        }}>
          Dead Letter ({deadLetter.entries.length})
        </h3>
      </div>
      {deadLetter.entries.map(entry => {
        const lastAnalysis = entry.diagnosticHistory[entry.diagnosticHistory.length - 1];
        const category = lastAnalysis?.rootCauseCategory?.replace(/_/g, ' ') ?? 'unknown';
        return (
          <div key={entry.taskId} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 0', borderTop: '1px solid var(--border)',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>
              {entry.taskId}
            </span>
            <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.taskTitle}
            </span>
            <span style={{ fontSize: 11, color: 'var(--dim)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {entry.recoveryAttemptCount} attempts · {category}
            </span>
            <Btn size="sm" variant="secondary" onClick={() => onCommand('ralphCodex.requeueDeadLetterTask')}>
              Requeue
            </Btn>
          </div>
        );
      })}
    </Card>
  );
}

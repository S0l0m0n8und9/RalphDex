import React from 'react';
import type { DashboardFirstRunChecklistItem } from '../../../webview/dashboardSnapshot';
import { Card, StatusPill } from '../primitives/Card';

interface FirstRunReadinessProps {
  checklist: DashboardFirstRunChecklistItem[];
}

export function FirstRunReadiness({ checklist }: FirstRunReadinessProps) {
  if (checklist.length === 0) return null;

  return (
    <Card title="First-Run Readiness">
      <div style={{ display: 'grid', gap: 8 }}>
        {checklist.map(item => {
          const kind = item.status === 'blocker' ? 'bad' : item.status === 'warning' ? 'warn' : 'ok';
          const label = item.status === 'blocker' ? 'blocker' : item.status === 'warning' ? 'warning' : 'complete';
          return (
            <div key={item.id} style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '8px 10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>{item.label}</span>
                <StatusPill kind={kind} small>{label}</StatusPill>
              </div>
              <p style={{ fontSize: 11, color: 'var(--dim)', margin: 0, lineHeight: 1.5 }}>{item.detail}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

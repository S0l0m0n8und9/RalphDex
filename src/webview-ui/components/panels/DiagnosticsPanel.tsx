import React from 'react';
import { Card, Icon } from '../primitives/Card';

interface Diagnostic {
  severity: string;
  message: string;
}

interface DiagnosticsPanelProps {
  diagnostics: Diagnostic[];
}

function severityStyle(sev: string): { icon: React.ReactNode; color: string } {
  if (sev === 'ok')   return { icon: Icon.check, color: 'var(--ok)' };
  if (sev === 'warn') return { icon: Icon.warn,  color: 'var(--warn)' };
  if (sev === 'bad')  return { icon: Icon.x,     color: 'var(--bad)' };
  return { icon: Icon.dot, color: 'var(--dim)' };
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  return (
    <Card title="Preflight & Diagnostics">
      <div style={{ display: 'grid', gap: 6 }}>
        {diagnostics.map(d => {
          const { icon, color } = severityStyle(d.severity);
          return (
            <div key={`${d.severity}:${d.message}`} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '4px 0' }}>
              <span style={{ color, display: 'flex', flexShrink: 0 }}>{icon}</span>
              <span style={{ color: 'var(--fg)' }}>{d.message}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

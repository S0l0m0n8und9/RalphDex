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
  if (sev === 'ok')   return { icon: Icon.check, color: 'var(--rdx-ok)' };
  if (sev === 'warn') return { icon: Icon.warn,  color: 'var(--rdx-warn)' };
  if (sev === 'bad')  return { icon: Icon.x,     color: 'var(--rdx-bad)' };
  return { icon: Icon.dot, color: 'var(--rdx-dim)' };
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  return (
    <Card title={'Preflight & Diagnostics'}>
      <div style={{ display: 'grid', gap: 5 }}>
        {diagnostics.map((d, i) => {
          const { icon, color } = severityStyle(d.severity);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, padding: '3px 0' }}>
              <span style={{ color, display: 'flex', flexShrink: 0 }}>{icon}</span>
              <span>{d.message}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

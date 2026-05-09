import React from 'react';

interface HealthCellProps {
  label: string;
  value: string;
  sub: string;
  bar?: number;
  barColor?: string;
  tone?: 'ok' | 'warn' | 'bad' | 'neutral';
}

const TONE_COLOR: Record<NonNullable<HealthCellProps['tone']>, string> = {
  ok:      'var(--rdx-ok)',
  warn:    'var(--rdx-warn)',
  bad:     'var(--rdx-bad)',
  neutral: 'var(--rdx-fg)',
};

export function HealthCell({ label, value, sub, bar, barColor = 'var(--rdx-accent)', tone = 'neutral' }: HealthCellProps) {
  return (
    <div style={{
      padding: '12px 14px',
      borderRight: '1px solid var(--rdx-border)',
      display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0,
    }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--rdx-dim)', fontWeight: 600 }}>
        {label.toUpperCase()}
      </span>
      <span style={{
        fontSize: 20, fontWeight: 500, color: TONE_COLOR[tone], letterSpacing: -0.3,
        fontFamily: 'var(--rdx-mono)', lineHeight: 1,
      }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--rdx-dim)' }}>{sub}</span>
      {typeof bar === 'number' && (
        <div style={{ height: 3, background: 'var(--rdx-border)', borderRadius: 2, overflow: 'hidden', marginTop: 1 }}>
          <div style={{ height: '100%', width: `${Math.min(100, bar)}%`, background: barColor }} />
        </div>
      )}
    </div>
  );
}

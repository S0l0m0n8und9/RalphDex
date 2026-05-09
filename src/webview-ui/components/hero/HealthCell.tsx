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
  ok:      'var(--ok)',
  warn:    'var(--warn)',
  bad:     'var(--bad)',
  neutral: 'var(--fg)',
};

export function HealthCell({ label, value, sub, bar, barColor = 'var(--accent)', tone = 'neutral' }: HealthCellProps) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--dim)', fontWeight: 600 }}>
        {label.toUpperCase()}
      </span>
      <span style={{
        fontSize: 22, fontWeight: 500, color: TONE_COLOR[tone],
        letterSpacing: -0.3, fontFamily: 'var(--font-mono)', lineHeight: 1,
      }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--dim)' }}>{sub}</span>
      {typeof bar === 'number' && (
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
          <div style={{ height: '100%', width: `${Math.min(100, bar)}%`, background: barColor, transition: 'width 0.4s' }} />
        </div>
      )}
    </div>
  );
}

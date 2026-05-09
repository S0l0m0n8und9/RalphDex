import React from 'react';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- Card ---------------------------------------------------------------

interface CardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  padding?: string;
  accent?: boolean;
}

export function Card({ title, subtitle, action, children, style, padding = '16px 18px', accent = false }: CardProps) {
  return (
    <section style={{
      background: 'var(--rdx-surface)',
      border: '1px solid var(--rdx-border)',
      borderRadius: 8,
      padding,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      borderTop: accent ? '2px solid var(--rdx-accent)' : '1px solid var(--rdx-border)',
      ...style,
    }}>
      {(title || action) && (
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: subtitle ? 2 : 12 }}>
          {title && (
            <h3 style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 1.4,
              textTransform: 'uppercase', color: 'var(--rdx-dim)', margin: 0, flex: 1,
            }}>
              {title.toUpperCase()}
            </h3>
          )}
          {action}
        </header>
      )}
      {subtitle && <p style={{ fontSize: 12, color: 'var(--rdx-dim)', margin: '0 0 12px 0' }}>{subtitle}</p>}
      {children}
    </section>
  );
}

// ---- StatusPill ---------------------------------------------------------

type StatusPillKind = 'running' | 'idle' | 'stopped' | 'warn' | 'bad' | 'ok' | 'accent' | 'neutral';

interface StatusPillProps {
  kind?: StatusPillKind;
  small?: boolean;
  children: React.ReactNode;
}

const PILL_STYLES: Record<StatusPillKind, { bg: string; fg: string; bd: string }> = {
  running: { bg: 'color-mix(in srgb, var(--rdx-ok) 12%, transparent)',     fg: 'var(--rdx-ok)',     bd: 'color-mix(in srgb, var(--rdx-ok) 35%, transparent)' },
  idle:    { bg: 'color-mix(in srgb, var(--rdx-dim) 14%, transparent)',    fg: 'var(--rdx-dim)',    bd: 'var(--rdx-border)' },
  stopped: { bg: 'color-mix(in srgb, var(--rdx-warn) 12%, transparent)',   fg: 'var(--rdx-warn)',   bd: 'color-mix(in srgb, var(--rdx-warn) 35%, transparent)' },
  warn:    { bg: 'color-mix(in srgb, var(--rdx-warn) 12%, transparent)',   fg: 'var(--rdx-warn)',   bd: 'color-mix(in srgb, var(--rdx-warn) 35%, transparent)' },
  bad:     { bg: 'color-mix(in srgb, var(--rdx-bad) 12%, transparent)',    fg: 'var(--rdx-bad)',    bd: 'color-mix(in srgb, var(--rdx-bad) 35%, transparent)' },
  ok:      { bg: 'color-mix(in srgb, var(--rdx-ok) 12%, transparent)',     fg: 'var(--rdx-ok)',     bd: 'color-mix(in srgb, var(--rdx-ok) 35%, transparent)' },
  accent:  { bg: 'color-mix(in srgb, var(--rdx-accent) 14%, transparent)', fg: 'var(--rdx-accent)', bd: 'color-mix(in srgb, var(--rdx-accent) 40%, transparent)' },
  neutral: { bg: 'transparent',                                              fg: 'var(--rdx-fg)',     bd: 'var(--rdx-border)' },
};

export function StatusPill({ kind = 'neutral', small, children }: StatusPillProps) {
  const s = PILL_STYLES[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: small ? '2px 7px' : '3px 9px',
      borderRadius: 999,
      background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
      fontSize: small ? 10 : 11, fontWeight: 600, letterSpacing: 0.3,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

// ---- Btn ----------------------------------------------------------------

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md' | 'lg';

interface BtnProps {
  variant?: BtnVariant;
  size?: BtnSize;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}

const BTN_VARIANTS: Record<BtnVariant, { bg: string; fg: string; bd: string }> = {
  primary:   { bg: 'var(--rdx-accent)',   fg: 'var(--rdx-primary-fg)',  bd: 'var(--rdx-accent)' },
  secondary: { bg: 'var(--rdx-surface-2)',fg: 'var(--rdx-fg)',           bd: 'var(--rdx-border)' },
  ghost:     { bg: 'transparent',          fg: 'var(--rdx-dim)',          bd: 'transparent' },
  danger:    { bg: 'transparent',          fg: 'var(--rdx-bad)',          bd: 'color-mix(in srgb, var(--rdx-bad) 40%, transparent)' },
};

const BTN_SIZES: Record<BtnSize, { p: string; fs: number }> = {
  sm: { p: '4px 10px', fs: 11 },
  md: { p: '7px 13px', fs: 12 },
  lg: { p: '10px 18px', fs: 13 },
};

export function Btn({ variant = 'secondary', size = 'md', children, onClick, disabled, style }: BtnProps) {
  const v = BTN_VARIANTS[variant];
  const s = BTN_SIZES[size];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: s.p, fontSize: s.fs,
        fontWeight: variant === 'primary' ? 600 : 500,
        background: v.bg, color: v.fg, border: `1px solid ${v.bd}`,
        borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit', letterSpacing: 0.1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ---- HealthPulse --------------------------------------------------------

interface HealthPulseProps {
  state: 'running' | 'idle' | 'stopped';
}

export function HealthPulse({ state }: HealthPulseProps) {
  const color = state === 'running' ? 'var(--rdx-ok)' : state === 'stopped' ? 'var(--rdx-warn)' : 'var(--rdx-dim)';
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 10, height: 10, flexShrink: 0 }}>
      {state === 'running' && (
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%', background: color,
          animation: 'rdx-pulse 1.6s ease-out infinite', opacity: 0.35,
        }} />
      )}
      <span style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: color }} />
    </span>
  );
}

// ---- Icon set -----------------------------------------------------------

export const Icon = {
  play:  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  stop:  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>,
  check: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5 11-11"/></svg>,
  warn:  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>,
  x:     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  bolt:  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>,
  dot:   <svg width="6"  height="6"  viewBox="0 0 6 6"   fill="currentColor"><circle cx="3" cy="3" r="3"/></svg>,
  cog:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8 2 2 0 01-2.8 2.8 1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3 2 2 0 01-2.8-2.8 1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 010-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8 2 2 0 012.8-2.8 1.6 1.6 0 001.8.3 1.6 1.6 0 001-1.5V3a2 2 0 014 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3 2 2 0 012.8 2.8 1.6 1.6 0 00-.3 1.8 1.6 1.6 0 001.5 1H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z"/></svg>,
  graph: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7 7l4 9M17 7l-4 9"/></svg>,
  plus:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  ask:   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4M12 17h.01"/></svg>,
  arrow: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
} as const;

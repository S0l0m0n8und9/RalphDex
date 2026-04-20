// Shared UI primitives and tokens for the Ralph dashboard prototype.

const TOKENS = {
  // Light + dark + accent come from CSS vars so Tweaks can swap live.
};

const HealthPulse = ({ state = 'running' }) => {
  const color = state === 'running' ? 'var(--ok)' : state === 'stopped' ? 'var(--warn)' : 'var(--dim)';
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 10, height: 10 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: color,
        animation: state === 'running' ? 'ralph-pulse 1.6s ease-out infinite' : 'none',
        opacity: 0.35,
      }} />
      <span style={{
        position: 'absolute', inset: 2, borderRadius: '50%', background: color,
      }} />
    </span>
  );
};

const Card = ({ title, subtitle, action, children, style, padding = '18px 20px', accent = false }) => (
  <section style={{
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    borderTop: accent ? '2px solid var(--accent)' : '1px solid var(--border)',
    ...style,
  }}>
    {(title || action) && (
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: subtitle ? 2 : 14 }}>
        {title && <h3 style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--dim)', margin: 0, flex: 1 }}>{title}</h3>}
        {action}
      </header>
    )}
    {subtitle && <p style={{ fontSize: 12, color: 'var(--dim)', margin: '0 0 14px 0' }}>{subtitle}</p>}
    {children}
  </section>
);

const StatusPill = ({ kind = 'neutral', children, small }) => {
  const map = {
    running: { bg: 'color-mix(in srgb, var(--ok) 12%, transparent)', fg: 'var(--ok)', bd: 'color-mix(in srgb, var(--ok) 35%, transparent)' },
    idle:    { bg: 'color-mix(in srgb, var(--dim) 14%, transparent)', fg: 'var(--dim)', bd: 'var(--border)' },
    stopped: { bg: 'color-mix(in srgb, var(--warn) 12%, transparent)', fg: 'var(--warn)', bd: 'color-mix(in srgb, var(--warn) 35%, transparent)' },
    warn:    { bg: 'color-mix(in srgb, var(--warn) 12%, transparent)', fg: 'var(--warn)', bd: 'color-mix(in srgb, var(--warn) 35%, transparent)' },
    bad:     { bg: 'color-mix(in srgb, var(--bad) 12%, transparent)', fg: 'var(--bad)', bd: 'color-mix(in srgb, var(--bad) 35%, transparent)' },
    ok:      { bg: 'color-mix(in srgb, var(--ok) 12%, transparent)', fg: 'var(--ok)', bd: 'color-mix(in srgb, var(--ok) 35%, transparent)' },
    accent:  { bg: 'color-mix(in srgb, var(--accent) 14%, transparent)', fg: 'var(--accent)', bd: 'color-mix(in srgb, var(--accent) 40%, transparent)' },
    neutral: { bg: 'transparent', fg: 'var(--fg)', bd: 'var(--border)' },
  };
  const s = map[kind] || map.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: small ? '2px 8px' : '3px 10px',
      borderRadius: 999,
      background: s.bg, color: s.fg,
      border: `1px solid ${s.bd}`,
      fontSize: small ? 10 : 11, fontWeight: 600, letterSpacing: 0.3,
    }}>{children}</span>
  );
};

const Btn = ({ variant='secondary', size='md', children, onClick, icon, style }) => {
  const variants = {
    primary: { bg: 'var(--accent)', fg: '#15131a', bd: 'var(--accent)', hover: 'color-mix(in srgb, var(--accent) 85%, white)' },
    secondary: { bg: 'var(--surface-2)', fg: 'var(--fg)', bd: 'var(--border)', hover: 'color-mix(in srgb, var(--surface-2) 80%, var(--fg) 6%)' },
    ghost: { bg: 'transparent', fg: 'var(--dim)', bd: 'transparent', hover: 'var(--surface-2)' },
    danger: { bg: 'transparent', fg: 'var(--bad)', bd: 'color-mix(in srgb, var(--bad) 40%, transparent)', hover: 'color-mix(in srgb, var(--bad) 10%, transparent)' },
  };
  const v = variants[variant];
  const sizes = { sm: { p: '5px 10px', fs: 11 }, md: { p: '8px 14px', fs: 12 }, lg: { p: '11px 20px', fs: 13 } };
  const s = sizes[size];
  return (
    <button
      onClick={onClick}
      onMouseEnter={e => e.currentTarget.style.background = v.hover}
      onMouseLeave={e => e.currentTarget.style.background = v.bg}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: s.p, fontSize: s.fs, fontWeight: variant==='primary' ? 600 : 500,
        background: v.bg, color: v.fg, border: `1px solid ${v.bd}`,
        borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
        letterSpacing: 0.1, transition: 'background 0.12s', ...style,
      }}
    >
      {icon}
      {children}
    </button>
  );
};

// Small semantic icon set
const Icon = {
  play: <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  pause: <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>,
  stop: <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>,
  plus: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  check: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5 11-11"/></svg>,
  warn: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17h0.01"/></svg>,
  x: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  ask: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4M12 17h0.01"/></svg>,
  arrow: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
  dot: <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor"><circle cx="3" cy="3" r="3"/></svg>,
  cog: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8 2 2 0 01-2.8 2.8 1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3 2 2 0 01-2.8-2.8 1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 010-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8 2 2 0 012.8-2.8 1.6 1.6 0 001.8.3h0a1.6 1.6 0 001-1.5V3a2 2 0 014 0v.1a1.6 1.6 0 001 1.5h0a1.6 1.6 0 001.8-.3 2 2 0 012.8 2.8 1.6 1.6 0 00-.3 1.8v0a1.6 1.6 0 001.5 1H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z"/></svg>,
  graph: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7 7l4 9M17 7l-4 9"/></svg>,
  bolt: <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>,
  clock: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  skull: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3C7 3 4 7 4 11c0 3 1 5 2 6v3h12v-3c1-1 2-3 2-6 0-4-3-8-8-8z"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/></svg>,
};

window.Card = Card;
window.StatusPill = StatusPill;
window.Btn = Btn;
window.HealthPulse = HealthPulse;
window.Icon = Icon;

// VS Code editor chrome — activity bar + sidebar + title bar wrapping the Ralph dashboard
const { useState } = React;

const vscFrameStyles = {
  shell: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--vsc-bg)',
    fontFamily: 'var(--font-ui)',
    color: 'var(--vsc-fg)',
    overflow: 'hidden',
    borderRadius: 10,
    boxShadow: '0 30px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)',
  },
  titleBar: {
    height: 30,
    background: 'var(--vsc-titlebar)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    gap: 12,
    borderBottom: '1px solid var(--vsc-border)',
    flexShrink: 0,
  },
  dots: { display: 'flex', gap: 8 },
  dot: { width: 11, height: 11, borderRadius: '50%' },
  titleText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: 'var(--vsc-dim)',
    letterSpacing: 0.2,
  },
  body: { flex: 1, display: 'flex', minHeight: 0, minWidth: 0 },
  activityBar: {
    width: 48,
    background: 'var(--vsc-activity)',
    borderRight: '1px solid var(--vsc-border)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 0',
    gap: 4,
    flexShrink: 0,
  },
  activityIcon: (active) => ({
    width: 48,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--vsc-fg)' : 'var(--vsc-dim)',
    cursor: 'pointer',
  }),
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  tabStrip: {
    height: 34,
    background: 'var(--vsc-tabs)',
    borderBottom: '1px solid var(--vsc-border)',
    display: 'flex',
    alignItems: 'stretch',
    flexShrink: 0,
  },
  tab: (active) => ({
    padding: '0 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: active ? 'var(--vsc-fg)' : 'var(--vsc-dim)',
    background: active ? 'var(--vsc-bg)' : 'transparent',
    borderRight: '1px solid var(--vsc-border)',
    borderTop: active ? '1px solid var(--accent)' : '1px solid transparent',
    cursor: 'pointer',
  }),
  content: { flex: 1, minHeight: 0, overflow: 'hidden', background: 'var(--vsc-bg)', display:'flex', flexDirection:'column' },
  statusBar: {
    height: 22,
    background: 'var(--accent)',
    color: '#101014',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    fontSize: 11,
    gap: 14,
    flexShrink: 0,
  },
};

function ActivityIcon({ path, active, onClick, title }) {
  return (
    <div style={vscFrameStyles.activityIcon(active)} onClick={onClick} title={title}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {path}
      </svg>
    </div>
  );
}

function VSCodeFrame({ children, loopState = 'running', workspace = 'acme-delivery', taskId = 'T-4127' }) {
  const [active, setActive] = useState('ralph');
  return (
    <div style={vscFrameStyles.shell}>
      <div style={vscFrameStyles.titleBar}>
        <div style={vscFrameStyles.dots}>
          <div style={{ ...vscFrameStyles.dot, background: '#ff5f57' }} />
          <div style={{ ...vscFrameStyles.dot, background: '#febc2e' }} />
          <div style={{ ...vscFrameStyles.dot, background: '#28c840' }} />
        </div>
        <div style={vscFrameStyles.titleText}>
          {workspace} — Ralphdex — Visual Studio Code
        </div>
        <div style={{ width: 42 }} />
      </div>
      <div style={vscFrameStyles.body}>
        <div style={vscFrameStyles.activityBar}>
          <ActivityIcon active={active==='files'} onClick={()=>setActive('files')} title="Explorer"
            path={<><path d="M3 6h7l2 2h9v11H3z"/></>} />
          <ActivityIcon active={active==='search'} onClick={()=>setActive('search')} title="Search"
            path={<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></>} />
          <ActivityIcon active={active==='git'} onClick={()=>setActive('git')} title="Source Control"
            path={<><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5V16M8.5 6H14a4 4 0 014 4v1"/></>} />
          <ActivityIcon active={active==='debug'} onClick={()=>setActive('debug')} title="Run"
            path={<><circle cx="12" cy="12" r="9"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></>} />
          <div style={{ flex: 1 }} />
          {/* Ralphdex icon (active) */}
          <ActivityIcon active={active==='ralph'} onClick={()=>setActive('ralph')} title="Ralphdex"
            path={<><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" strokeWidth="1.3"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/></>} />
          <ActivityIcon active={false} title="Settings"
            path={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>} />
        </div>

        <div style={vscFrameStyles.main}>
          <div style={vscFrameStyles.tabStrip}>
            <div style={vscFrameStyles.tab(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6">
                <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>
              </svg>
              Ralphdex: Dashboard
              <span style={{ marginLeft: 4, opacity: 0.6 }}>×</span>
            </div>
            <div style={{ flex: 1 }} />
          </div>
          <div style={vscFrameStyles.content}>
            {children}
          </div>
          <div style={vscFrameStyles.statusBar}>
            <span style={{ display:'flex', alignItems:'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5V16M8.5 6H14a4 4 0 014 4v1"/></svg>
              main
            </span>
            <span>⚙ ralphdex</span>
            <span style={{ fontWeight: 600 }}>● ralph: {loopState}</span>
            <span>▸ task {taskId}</span>
            <div style={{ flex: 1 }} />
            <span>Ln 1, Col 1</span>
            <span>UTF-8</span>
            <span>TypeScript</span>
          </div>
        </div>
      </div>
    </div>
  );
}

window.VSCodeFrame = VSCodeFrame;

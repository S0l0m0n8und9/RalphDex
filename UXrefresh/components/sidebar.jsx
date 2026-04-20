// Sidebar — secondary navigation + current-task focus + quick actions.

function Sidebar({ data, mode, activeTab, onTab, onMode }) {
  const modeLabels = [
    { id:'simple', label:'Simple', sub:'one-task' },
    { id:'standard', label:'Standard', sub:'balanced' },
    { id:'advanced', label:'Advanced', sub:'mission-ctrl' },
  ];
  const tabs = mode === 'simple'
    ? [
        {id:'now', label:'What now', icon: Icon.bolt},
        {id:'pipelines', label:'Pipelines', icon: Icon.graph},
        {id:'tasks', label:'Tasks', icon: Icon.graph},
      ]
    : mode === 'standard'
    ? [
        {id:'now', label:'Overview', icon: Icon.bolt},
        {id:'pipelines', label:'Pipelines', icon: Icon.graph},
        {id:'tasks', label:'Tasks', icon: Icon.graph},
        {id:'diagnostics', label:'Diagnostics', icon: Icon.warn},
        {id:'settings', label:'Settings', icon: Icon.cog},
      ]
    : [
        {id:'now', label:'Overview', icon: Icon.bolt},
        {id:'pipelines', label:'Pipelines', icon: Icon.graph},
        {id:'orchestration', label:'Orchestration', icon: Icon.bolt},
        {id:'tasks', label:'Tasks', icon: Icon.graph},
        {id:'diagnostics', label:'Diagnostics', icon: Icon.warn},
        {id:'settings', label:'Settings', icon: Icon.cog},
      ];

  return (
    <aside style={{
      width: 240, flexShrink: 0, background:'var(--sidebar)', borderRight:'1px solid var(--border)',
      display:'flex', flexDirection:'column', padding: '12px 0', overflow:'auto',
    }}>
      <div style={{ padding:'0 14px 10px', borderBottom:'1px solid var(--border)', marginBottom:10 }}>
        <div style={{ fontSize: 10, textTransform:'uppercase', letterSpacing:1.4, color:'var(--dim)', fontWeight:600, marginBottom:4 }}>
          Ralphdex
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <HealthPulse state={data.loopState}/>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{data.workspace}</span>
        </div>
        <div style={{ fontSize: 11, color:'var(--dim)', marginTop: 2, fontFamily:'var(--font-mono)' }}>
          {data.provider} · {data.agentRole}
        </div>
      </div>

      <div style={{ padding:'0 10px', marginBottom: 14 }}>
        <div style={{ fontSize: 9, textTransform:'uppercase', letterSpacing:1.4, color:'var(--dim)', fontWeight:700, margin:'6px 4px 8px' }}>
          Mode
        </div>
        <div style={{ display:'grid', gap: 4, padding: 3, background:'var(--surface-2)', borderRadius:6, border:'1px solid var(--border)' }}>
          {modeLabels.map(m => {
            const active = mode === m.id;
            return (
              <button key={m.id} onClick={()=>onMode(m.id)} style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'6px 8px', borderRadius: 4, fontFamily:'inherit',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#15131a' : 'var(--fg)',
                border: 'none', cursor:'pointer', fontSize: 12, fontWeight: active?600:400,
                textAlign:'left',
              }}>
                <span>{m.label}</span>
                <span style={{ fontSize: 10, opacity: 0.7 }}>{m.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      <nav style={{ padding: '0 6px', display:'grid', gap: 2 }}>
        {tabs.map(t => {
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={()=>onTab(t.id)} style={{
              display:'flex', alignItems:'center', gap: 10,
              padding:'8px 12px', borderRadius: 5, fontFamily:'inherit', fontSize: 12,
              background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
              color: active ? 'var(--fg)' : 'var(--dim)',
              border:'none', cursor:'pointer', textAlign:'left',
              fontWeight: active ? 600 : 400,
              borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
              <span style={{ color: active ? 'var(--accent)':'var(--dim)', display:'flex' }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </nav>

      <div style={{ padding:'0 14px', marginTop: 18 }}>
        <div style={{ fontSize: 9, textTransform:'uppercase', letterSpacing:1.4, color:'var(--dim)', fontWeight:700, margin:'6px 0 8px' }}>
          Quick actions
        </div>
        <div style={{ display:'grid', gap: 4 }}>
          <QuickAction label="Initialize workspace" shortcut="⌘⇧I"/>
          <QuickAction label="New project wizard" shortcut="⌘⇧W"/>
          <QuickAction label="Add task" shortcut="⌘T"/>
          <QuickAction label="Prepare prompt" shortcut="⌘P"/>
          <QuickAction label="Show dashboard" shortcut="⌘D"/>
        </div>
      </div>

      <div style={{ flex: 1 }}/>

      {/* current task focus */}
      <div style={{ margin:'8px 10px 4px', padding: 12, background:'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 9, textTransform:'uppercase', letterSpacing:1.4, color:'var(--dim)', fontWeight:700, marginBottom: 6 }}>
          Current task
        </div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize: 11, color:'var(--accent)', marginBottom: 4 }}>{data.currentTask.id}</div>
        <div style={{ fontSize: 12, lineHeight: 1.4 }}>{data.currentTask.title}</div>
      </div>
    </aside>
  );
}

function QuickAction({ label, shortcut }) {
  return (
    <button style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'5px 8px', borderRadius: 4, fontFamily:'inherit', fontSize: 11,
      background:'transparent', color:'var(--dim)', border:'none', cursor:'pointer', textAlign:'left',
    }}
    onMouseEnter={e=>{ e.currentTarget.style.background='var(--surface-2)'; e.currentTarget.style.color='var(--fg)'; }}
    onMouseLeave={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--dim)'; }}
    >
      <span>{label}</span>
      <span style={{ fontSize: 10, fontFamily:'var(--font-mono)', opacity: 0.6 }}>{shortcut}</span>
    </button>
  );
}

window.Sidebar = Sidebar;

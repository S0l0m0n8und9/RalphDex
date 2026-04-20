// Presets & Settings (advanced) panel.

function PresetChooser({ preset, onPreset }) {
  const presets = [
    { id:'simple', label:'Simple', sub:'Guided, one task at a time', body:'Single agent · supervised · autonomy off · ideal for novices' },
    { id:'standard', label:'Standard', sub:'Balanced defaults', body:'One implementer agent · autonomous · validation gates · most common' },
    { id:'multi-agent', label:'Multi-Agent', sub:'Reviewer + watchdog + SCM', body:'4 concurrent roles · model tiering · auto-recovery' },
    { id:'hardcore', label:'Hardcore', sub:'Full throttle', body:'8 agents · complex threshold lowered · 30 iter cap · human gates off' },
  ];
  return (
    <Card title="Preset" subtitle="Save and switch between setups for specific use-cases.">
      <div style={{ display:'grid', gap:8, gridTemplateColumns:'repeat(2, 1fr)' }}>
        {presets.map(p => {
          const active = preset === p.id;
          return (
            <button key={p.id} onClick={()=>onPreset(p.id)} style={{
              textAlign:'left', padding:'12px 14px',
              background: active ? 'color-mix(in srgb, var(--accent) 10%, var(--surface-2))' : 'var(--surface-2)',
              border: `1px solid ${active?'var(--accent)':'var(--border)'}`,
              borderRadius: 8, cursor:'pointer', fontFamily:'inherit', color:'var(--fg)',
              display:'flex', flexDirection:'column', gap:2,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</span>
                {active && <StatusPill kind="accent" small>active</StatusPill>}
              </div>
              <span style={{ fontSize: 11, color:'var(--dim)' }}>{p.sub}</span>
              <span style={{ fontSize: 11, color:'var(--fg-dim)', marginTop: 4, lineHeight:1.4 }}>{p.body}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display:'flex', gap: 8, marginTop: 12 }}>
        <Btn variant="secondary" size="sm" icon={Icon.plus}>New preset from current</Btn>
        <Btn variant="ghost" size="sm">Export</Btn>
        <Btn variant="ghost" size="sm">Import</Btn>
      </div>
    </Card>
  );
}

function SettingsPanel({ data }) {
  return (
    <Card title="Configuration" subtitle="ralphCodex.* settings. Advanced users — save as a preset when tuned.">
      <div style={{ display:'grid', gap: 18 }}>
        <SettingsGroup label="Provider">
          <Setting k="cliProvider" v="claude" choices={['claude','codex','copilot','copilot-foundry','azure-foundry','gemini']}/>
          <Setting k="model" v="claude-sonnet-4-6" />
          <Setting k="reasoningEffort" v="medium" choices={['low','medium','high']}/>
        </SettingsGroup>
        <SettingsGroup label="Agent">
          <Setting k="agentRole" v="implementer" choices={['planner','implementer','reviewer','watchdog','scm']}/>
          <Setting k="agentCount" v="1" />
          <Setting k="autonomyMode" v="autonomous" choices={['supervised','autonomous']}/>
        </SettingsGroup>
        <SettingsGroup label="Loop">
          <Setting k="ralphIterationCap" v="12" />
          <Setting k="noProgressThreshold" v="2" />
          <Setting k="repeatedFailureThreshold" v="2" />
        </SettingsGroup>
        <SettingsGroup label="SCM">
          <Setting k="gitCheckpointMode" v="snapshotAndDiff" choices={['off','snapshot','snapshotAndDiff']}/>
          <Setting k="scmStrategy" v="commit-on-done" choices={['none','commit-on-done','branch-per-task']}/>
        </SettingsGroup>
      </div>
    </Card>
  );
}

function SettingsGroup({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform:'uppercase', letterSpacing:1.4, color:'var(--accent)', fontWeight:600, marginBottom:8, paddingBottom:6, borderBottom:'1px solid var(--border)' }}>{label}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function Setting({ k, v, choices }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 10, color:'var(--dim)', fontFamily:'var(--font-mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{k}</span>
      {choices ? (
        <select defaultValue={v} style={{
          background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--fg)',
          borderRadius: 5, padding:'6px 8px', fontSize: 12, fontFamily:'inherit', minWidth: 0, width:'100%',
        }}>
          {choices.map(c => <option key={c}>{c}</option>)}
        </select>
      ) : (
        <input defaultValue={v} style={{
          background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--fg)',
          borderRadius: 5, padding:'6px 8px', fontSize: 12, fontFamily:'var(--font-mono)', minWidth: 0, width:'100%', boxSizing:'border-box',
        }}/>
      )}
    </label>
  );
}

function EmptyHint({ mode }) {
  if (mode !== 'simple') return null;
  return (
    <Card padding="14px 16px" style={{ borderStyle:'dashed' }}>
      <div style={{ display:'flex', gap: 10, alignItems:'flex-start' }}>
        <span style={{color:'var(--accent)', flexShrink:0, marginTop:2}}>{Icon.ask}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>New to Ralph?</div>
          <p style={{ fontSize: 12, color:'var(--dim)', lineHeight:1.55, margin:0 }}>
            Ralph reads <code style={{background:'var(--surface-2)', padding:'1px 4px', borderRadius:3, fontSize: 11}}>.ralph/prd.md</code> (your goal),
            picks the next task, asks your AI CLI to do it, and checks the result. Watch the <b style={{color:'var(--fg)'}}>Now</b> card above to follow along —
            switch to <b style={{color:'var(--fg)'}}>Standard</b> mode when you want more control.
          </p>
        </div>
      </div>
    </Card>
  );
}

window.PresetChooser = PresetChooser;
window.SettingsPanel = SettingsPanel;
window.EmptyHint = EmptyHint;

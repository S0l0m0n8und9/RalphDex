// Failure panel — front and center for "something is wrong, here's what to do"
// plus the agent lanes and timeline.

function FailurePanel({ data }) {
  const f = data.failure;
  return (
    <Card padding="16px 18px" style={{ borderColor: 'color-mix(in srgb, var(--bad) 40%, var(--border))', background:'color-mix(in srgb, var(--bad) 4%, var(--surface))' }}>
      <div style={{ display:'flex', alignItems:'center', gap: 10, marginBottom: 10 }}>
        <span style={{ color:'var(--bad)', display:'flex' }}>{Icon.warn}</span>
        <h3 style={{ fontSize: 11, fontWeight:600, letterSpacing: 1.4, textTransform:'uppercase', color:'var(--bad)', margin:0, flex:1 }}>
          Needs Attention · Failure Diagnosis
        </h3>
        <StatusPill kind="bad" small>{f.confidence} confidence</StatusPill>
      </div>
      <div style={{ display:'flex', gap: 8, alignItems:'baseline', marginBottom: 6, flexWrap:'wrap' }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize: 11, padding:'2px 6px', background:'var(--surface-2)', borderRadius: 3, color:'var(--accent)' }}>{f.taskId}</span>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{f.taskTitle}</span>
        <span style={{ flex: 1 }}/>
        <span style={{ fontSize: 11, color:'var(--dim)' }}>attempt {f.attempts} · category <b style={{color:'var(--fg)'}}>{f.category}</b></span>
      </div>

      <div style={{
        background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius: 6,
        padding: 12, marginTop: 6, marginBottom: 10,
      }}>
        <div style={{ fontSize: 10, textTransform:'uppercase', letterSpacing:1.2, color:'var(--dim)', fontWeight:600, marginBottom: 4 }}>What went wrong</div>
        <p style={{ fontSize: 13, lineHeight: 1.55, margin:0, color:'var(--fg)' }}>{f.summary}</p>
      </div>
      <div style={{
        border:'1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
        background:'color-mix(in srgb, var(--accent) 6%, transparent)',
        borderRadius: 6, padding: 12, marginBottom: 12,
      }}>
        <div style={{ fontSize: 10, textTransform:'uppercase', letterSpacing:1.2, color:'var(--accent)', fontWeight:600, marginBottom: 4, display:'flex', alignItems:'center', gap:6 }}>
          {Icon.bolt} Suggested fix
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.55, margin:0, color:'var(--fg)' }}>{f.suggestedAction}</p>
      </div>

      <div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>
        <Btn variant="primary" size="sm" icon={Icon.bolt}>Auto-recover task</Btn>
        <Btn variant="secondary" size="sm">Apply & retry</Btn>
        <Btn variant="secondary" size="sm">Open failure artifact</Btn>
        <Btn variant="ghost" size="sm">Skip task</Btn>
        <Btn variant="danger" size="sm">Send to dead-letter</Btn>
      </div>
    </Card>
  );
}

function AgentLanes({ data }) {
  return (
    <Card title="Agent Lanes" subtitle={`${data.agents.length} concurrent agents`}>
      <div style={{ display:'grid', gap: 8 }}>
        {data.agents.map(a => <AgentLane key={a.id} agent={a}/>)}
      </div>
    </Card>
  );
}

function AgentLane({ agent }) {
  const roleColor = {
    implementer:'var(--accent)', reviewer:'var(--ok)', watchdog:'var(--warn)', scm:'var(--cyan)'
  }[agent.role] || 'var(--dim)';
  return (
    <div style={{
      display:'flex', alignItems:'center', gap: 12, padding:'10px 12px',
      border:'1px solid var(--border)', borderRadius: 8, background:'var(--surface-2)',
      borderLeft: `3px solid ${roleColor}`,
    }}>
      <div style={{ minWidth: 120 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:12, fontWeight:600, color:'var(--fg)' }}>{agent.id}</div>
        <div style={{ fontSize: 10, textTransform:'uppercase', letterSpacing: 1, color: roleColor, fontWeight:600 }}>{agent.role}</div>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <PhaseTracker active={agent.phase} compact/>
      </div>
      <div style={{ display:'flex', gap:14, fontSize: 11, color:'var(--dim)', whiteSpace:'nowrap' }}>
        <span>iter <b style={{color:'var(--fg)', fontFamily:'var(--font-mono)'}}>{agent.iteration}</b></span>
        <span>task <b style={{color:'var(--fg)', fontFamily:'var(--font-mono)'}}>{agent.task || '—'}</b></span>
        <span>✓ <b style={{color:'var(--fg)'}}>{agent.throughput}</b></span>
      </div>
    </div>
  );
}

function Timeline({ data }) {
  const classColor = {
    complete:'var(--ok)', partial_progress:'var(--accent)', no_progress:'var(--dim)',
    blocked:'var(--warn)', failed:'var(--bad)', needs_human_review:'var(--cyan)',
  };
  return (
    <Card title="Iteration Timeline" subtitle="Most recent first · click to inspect artifact">
      <div style={{ display:'grid', gap: 4 }}>
        {data.history.map(h => (
          <button key={h.n} style={{
            display:'grid', gridTemplateColumns:'28px 60px 70px 1fr 70px 60px', gap: 8, alignItems:'center',
            padding:'8px 10px', background:'var(--surface-2)', border:'1px solid var(--border)',
            borderRadius: 6, fontFamily:'inherit', color:'var(--fg)', cursor:'pointer', textAlign:'left',
            fontSize: 12,
          }}
          onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'}
          onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
            <span style={{ fontFamily:'var(--font-mono)', color:'var(--dim)', fontSize: 11 }}>#{h.n}</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize: 11, color:'var(--dim)' }}>{h.agent}</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize: 11, color:'var(--accent)' }}>{h.task}</span>
            <span style={{
              display:'inline-flex', alignItems:'center', gap: 6,
              color: classColor[h.classification],
              fontSize: 12, fontWeight: 500,
            }}>
              <span style={{width:6, height:6, borderRadius:'50%', background: classColor[h.classification]}}/>
              {h.classification.replace(/_/g,' ')}
            </span>
            <span style={{ color:'var(--dim)', fontSize: 11, fontFamily:'var(--font-mono)' }}>{h.duration}</span>
            <span style={{ color:'var(--dim)', fontSize: 11, fontFamily:'var(--font-mono)', textAlign:'right' }}>${h.cost.toFixed(2)}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function DeadLetter({ data }) {
  if (data.deadLetter.length === 0) return null;
  return (
    <Card padding="14px 16px" style={{ borderColor:'color-mix(in srgb, var(--warn) 35%, var(--border))' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <span style={{ color:'var(--warn)', display:'flex' }}>{Icon.skull}</span>
        <h3 style={{ fontSize: 11, fontWeight:600, letterSpacing: 1.4, textTransform:'uppercase', color:'var(--warn)', margin:0, flex:1 }}>
          Dead Letter ({data.deadLetter.length})
        </h3>
      </div>
      {data.deadLetter.map(dl => (
        <div key={dl.taskId} style={{ display:'flex', alignItems:'center', gap: 10, padding:'8px 0', borderTop:'1px solid var(--border)' }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize: 11, color:'var(--accent)' }}>{dl.taskId}</span>
          <span style={{ flex:1, fontSize: 13 }}>{dl.title}</span>
          <span style={{ fontSize: 11, color:'var(--dim)' }}>{dl.attempts} attempts · {dl.lastCategory.replace(/_/g,' ')}</span>
          <Btn size="sm" variant="secondary">Requeue</Btn>
        </div>
      ))}
    </Card>
  );
}

function DiagnosticsPanel({ data }) {
  const iconFor = sev => sev === 'ok' ? {icon: Icon.check, color: 'var(--ok)'}
    : sev === 'warn' ? {icon: Icon.warn, color: 'var(--warn)'}
    : sev === 'bad' ? {icon: Icon.x, color: 'var(--bad)'} : {icon: Icon.dot, color: 'var(--dim)'};
  return (
    <Card title="Preflight & Diagnostics">
      <div style={{ display:'grid', gap: 6 }}>
        {data.diagnostics.map((d,i) => {
          const {icon, color} = iconFor(d.severity);
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap: 10, fontSize: 12, padding: '4px 0' }}>
              <span style={{ color }}>{icon}</span>
              <span style={{ color:'var(--fg)' }}>{d.message}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

window.FailurePanel = FailurePanel;
window.AgentLanes = AgentLanes;
window.Timeline = Timeline;
window.DeadLetter = DeadLetter;
window.DiagnosticsPanel = DiagnosticsPanel;

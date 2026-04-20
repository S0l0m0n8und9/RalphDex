// Orchestration — Advanced-only mission-control content.
// Budget meters · policy rules · model routing · raw iteration log.

function Orchestration({ data }) {
  return (
    <div style={{ display:'grid', gap: 14 }}>
      <BudgetStrip data={data}/>
      <div style={{ display:'grid', gap: 14, gridTemplateColumns:'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <PolicyRules policy={data.policy}/>
        <ModelRouting routing={data.policy.modelRouting}/>
      </div>
      <RawLog entries={data.rawLog}/>
    </div>
  );
}

function BudgetStrip({ data }) {
  const { policy, cost } = data;
  const hardPct = Math.min(100, (cost.today / policy.costCap.hard) * 100);
  const softPct = Math.min(100, (policy.costCap.soft / policy.costCap.hard) * 100);
  const overSoft = cost.today > policy.costCap.soft;

  const cells = [
    { label: 'Today · spend', big: `$${cost.today.toFixed(2)}`, sub: `of $${policy.costCap.hard.toFixed(2)} hard cap`, color: overSoft ? 'var(--warn)' : 'var(--fg)' },
    { label: 'Active loop',   big: `$${cost.loop.toFixed(2)}`,  sub: `${data.iteration.current}/${data.iteration.cap} iter`, color: 'var(--fg)' },
    { label: 'Agents',        big: `${data.agents.length}`,     sub: `concurrency cap ${policy.concurrency}`, color: 'var(--fg)' },
    { label: 'Human gate',    big: policy.humanGate,            sub: 'current policy', color: policy.humanGate === 'off' ? 'var(--warn)' : 'var(--fg)', mono: true },
  ];

  return (
    <Card padding="16px 18px">
      <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 12 }}>
        <h3 style={{ fontSize: 11, fontWeight:600, letterSpacing:1.4, textTransform:'uppercase', color:'var(--accent)', margin:0, flex:1 }}>
          Orchestration · Budget &amp; Policy
        </h3>
        <Btn size="sm" variant="ghost">Reset today</Btn>
        <Btn size="sm" variant="secondary">Export run report</Btn>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 14 }}>
        {cells.map(c => (
          <div key={c.label}>
            <div style={{ fontSize: 10, textTransform:'uppercase', letterSpacing:1.2, color:'var(--dim)', fontWeight:600, marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 300, color: c.color, fontFamily: c.mono ? 'var(--font-mono)' : 'inherit', lineHeight: 1 }}>{c.big}</div>
            <div style={{ fontSize: 11, color:'var(--dim)', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize: 10, color:'var(--dim)', marginBottom: 4, fontFamily:'var(--font-mono)' }}>
          <span>$0</span>
          <span style={{ color: overSoft ? 'var(--warn)' : 'var(--dim)' }}>soft $<b>{policy.costCap.soft.toFixed(2)}</b></span>
          <span>hard ${policy.costCap.hard.toFixed(2)}</span>
        </div>
        <div style={{ position:'relative', height: 8, background:'var(--surface-2)', borderRadius: 4, overflow:'hidden' }}>
          <div style={{ position:'absolute', left: 0, top: 0, bottom: 0, width: `${hardPct}%`, background: overSoft ? 'var(--warn)' : 'var(--ok)', transition:'width .3s' }}/>
          <div style={{ position:'absolute', left: `${softPct}%`, top: -2, bottom: -2, width: 1, background:'var(--dim)' }}/>
        </div>
      </div>
    </Card>
  );
}

function PolicyRules({ policy }) {
  return (
    <Card title="Policy rules" subtitle="Apply to all running pipelines">
      <div style={{ display:'grid', gap: 6 }}>
        {policy.rules.map((r, i) => (
          <label key={i} style={{
            display:'flex', alignItems:'center', gap: 10,
            padding:'8px 10px', background:'var(--surface-2)', border:'1px solid var(--border)',
            borderRadius: 6, cursor:'pointer', fontSize: 12,
          }}>
            <span style={{
              width: 14, height: 14, borderRadius: 3, border:`1px solid ${r.enabled?'var(--accent)':'var(--border)'}`,
              background: r.enabled ? 'var(--accent)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center',
              color:'#15131a', flexShrink: 0,
            }}>{r.enabled && <span style={{ fontSize: 10, fontWeight: 700 }}>✓</span>}</span>
            <span style={{ flex: 1, color: r.enabled ? 'var(--fg)' : 'var(--dim)' }}>{r.label}</span>
          </label>
        ))}
      </div>
    </Card>
  );
}

function ModelRouting({ routing }) {
  return (
    <Card title="Model routing" subtitle="Per-phase model + reasoning effort">
      <div style={{ display:'grid', gap: 4 }}>
        <div style={{ display:'grid', gridTemplateColumns:'90px 1fr 70px', gap: 8, fontSize: 10, textTransform:'uppercase', letterSpacing: 1.2, color:'var(--dim)', fontWeight:600, padding:'4px 8px' }}>
          <span>Phase</span><span>Model</span><span>Effort</span>
        </div>
        {routing.map((r, i) => (
          <div key={i} style={{
            display:'grid', gridTemplateColumns:'90px 1fr 70px', gap: 8,
            padding:'8px', background:'var(--surface-2)', border:'1px solid var(--border)',
            borderRadius: 4, fontSize: 12, fontFamily:'var(--font-mono)', alignItems:'center',
          }}>
            <span style={{ color:'var(--accent)' }}>{r.when}</span>
            <span>{r.model}</span>
            <span style={{ color:'var(--dim)' }}>{r.effort}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RawLog({ entries }) {
  const lvlColor = { info:'var(--dim)', warn:'var(--warn)', error:'var(--bad)' };
  return (
    <Card title="Raw iteration log" subtitle="Advanced · stream · last 50 events">
      <div style={{
        background:'#0a0a0c', border:'1px solid var(--border)', borderRadius: 6,
        padding: 10, fontFamily:'var(--font-mono)', fontSize: 11, lineHeight: 1.6,
        maxHeight: 260, overflow:'auto',
      }}>
        {entries.map((e, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'70px 50px 70px 40px 1fr', gap: 10, padding:'1px 0' }}>
            <span style={{ color:'var(--dim)' }}>{e.ts}</span>
            <span style={{ color: lvlColor[e.lvl], textTransform:'uppercase', fontWeight:600 }}>{e.lvl}</span>
            <span style={{ color:'var(--accent)' }}>{e.agent}</span>
            <span style={{ color:'var(--dim)' }}>#{e.iter}</span>
            <span style={{ color:'#d4d4d4', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.msg}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

window.Orchestration = Orchestration;
window.BudgetStrip = BudgetStrip;
window.RawLog = RawLog;
window.PolicyRules = PolicyRules;
window.ModelRouting = ModelRouting;

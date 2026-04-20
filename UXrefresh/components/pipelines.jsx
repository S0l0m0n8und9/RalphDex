// Pipelines — named, savable sequences of tasks. Start / pause / monitor.
// Visible in all modes but Simple only sees the active one as a big card.

const { useState: usePipeState } = React;

function Pipelines({ data, mode }) {
  const [expanded, setExpanded] = usePipeState(data.pipelines[0]?.id);
  const [selectedState, setSelectedState] = usePipeState('all');

  const pipelines = data.pipelines || [];
  const counts = pipelines.reduce((acc, p) => { acc[p.state] = (acc[p.state]||0)+1; return acc; }, {});
  const filters = ['all','running','paused','queued','done'];
  const visible = selectedState === 'all' ? pipelines : pipelines.filter(p => p.state === selectedState);

  return (
    <div style={{ display:'grid', gap: 14 }}>
      <PipelinesHeader counts={counts} total={pipelines.length} mode={mode}/>

      {mode !== 'simple' && (
        <div style={{ display:'flex', gap: 6, flexWrap:'wrap', alignItems:'center' }}>
          {filters.map(f => {
            const active = selectedState === f;
            const n = f === 'all' ? pipelines.length : (counts[f] || 0);
            return (
              <button key={f} onClick={()=>setSelectedState(f)} style={{
                padding:'4px 10px', fontSize: 11, fontFamily:'inherit',
                background: active ? 'color-mix(in srgb, var(--accent) 15%, var(--surface-2))' : 'var(--surface-2)',
                border: `1px solid ${active?'var(--accent)':'var(--border)'}`, borderRadius: 999,
                color: active ? 'var(--accent)' : 'var(--dim)', cursor:'pointer',
                textTransform:'capitalize',
              }}>{f} <span style={{ opacity: 0.6, marginLeft: 4, fontFamily:'var(--font-mono)' }}>{n}</span></button>
            );
          })}
          <span style={{ flex: 1 }}/>
          <Btn size="sm" variant="secondary" icon={Icon.plus}>New pipeline</Btn>
          <Btn size="sm" variant="ghost">Import PRD…</Btn>
        </div>
      )}

      <div style={{ display:'grid', gap: 10 }}>
        {visible.map(p => (
          <PipelineCard
            key={p.id} pipeline={p} mode={mode}
            expanded={expanded === p.id}
            onToggle={()=>setExpanded(expanded === p.id ? null : p.id)}
          />
        ))}
        {visible.length === 0 && (
          <div style={{ padding:'32px 16px', textAlign:'center', color:'var(--dim)', fontSize: 12, border:'1px dashed var(--border)', borderRadius: 8 }}>
            No pipelines in <b style={{color:'var(--fg)'}}>{selectedState}</b> state.
          </div>
        )}
      </div>
    </div>
  );
}

function PipelinesHeader({ counts, total, mode }) {
  const items = [
    { label:'Running', value: counts.running || 0, color:'var(--ok)' },
    { label:'Paused',  value: counts.paused  || 0, color:'var(--warn)' },
    { label:'Queued',  value: counts.queued  || 0, color:'var(--dim)' },
    { label:'Done',    value: counts.done    || 0, color:'var(--cyan)' },
  ];
  return (
    <Card padding="16px 20px" accent>
      <div style={{ display:'flex', alignItems:'flex-start', gap: 16, flexWrap:'wrap' }}>
        <div style={{ flex:'1 1 280px', minWidth: 0 }}>
          <div style={{ fontSize: 10, textTransform:'uppercase', letterSpacing: 1.4, color:'var(--dim)', fontWeight:600, marginBottom: 4 }}>
            Pipelines
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, lineHeight: 1.2 }}>
            {total} pipeline{total === 1 ? '' : 's'} · <span style={{ color:'var(--ok)' }}>{counts.running || 0} live</span>
          </h2>
          <p style={{ fontSize: 12, color:'var(--dim)', margin:'6px 0 0', maxWidth: 560, lineHeight: 1.5 }}>
            A pipeline is a named goal made of ordered tasks. Start it and Ralph works through it on your behalf.
            {mode === 'simple' && ' Want to see more? Switch to Standard in the sidebar.'}
          </p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, auto)', gap: 18 }}>
          {items.map(i => (
            <div key={i.label} style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap: 2 }}>
              <div style={{ fontSize: 26, fontWeight: 300, color: i.color, lineHeight: 1, fontFamily:'var(--font-mono)' }}>{i.value}</div>
              <div style={{ fontSize: 10, textTransform:'uppercase', letterSpacing:1.2, color:'var(--dim)', fontWeight:600 }}>{i.label}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function PipelineCard({ pipeline: p, mode, expanded, onToggle }) {
  const stateColor = {
    running: 'var(--ok)', paused: 'var(--warn)', queued: 'var(--dim)', done: 'var(--cyan)', failed: 'var(--bad)',
  }[p.state] || 'var(--dim)';
  const pct = p.progress.total > 0 ? Math.round((p.progress.done / p.progress.total) * 100) : 0;
  const budgetPct = p.budgetUsd > 0 ? Math.min(100, Math.round((p.spentUsd / p.budgetUsd) * 100)) : 0;

  return (
    <div style={{
      border:'1px solid var(--border)', borderRadius: 10, background:'var(--surface)', overflow:'hidden',
      borderLeft: `3px solid ${stateColor}`,
    }}>
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0, 1fr) auto', gap: 16, padding:'14px 16px', alignItems:'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: 4, flexWrap:'wrap' }}>
            <span style={{ fontSize: 18 }}>{p.emoji}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color:'var(--fg)' }}>{p.name}</span>
            <StatusPill kind={p.state === 'running' ? 'running' : p.state === 'paused' ? 'warn' : p.state === 'done' ? 'accent' : 'idle'} small>
              {p.state}
            </StatusPill>
            <span style={{ fontSize: 11, color:'var(--dim)', fontFamily:'var(--font-mono)' }}>{p.preset}</span>
            {p.autonomy === 'supervised' && (
              <span style={{ fontSize: 10, color:'var(--warn)', textTransform:'uppercase', letterSpacing:1, fontWeight:600 }}>
                · supervised
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color:'var(--dim)', marginBottom: 10, lineHeight: 1.5, maxWidth: 680 }}>
            {p.goal}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'minmax(180px, 1fr) auto', gap: 14, alignItems:'center' }}>
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize: 10, color:'var(--dim)', marginBottom: 4, fontFamily:'var(--font-mono)' }}>
                <span>{p.progress.done} / {p.progress.total} tasks</span>
                <span>{pct}%</span>
              </div>
              <div style={{ height: 6, background:'var(--surface-2)', borderRadius: 3, overflow:'hidden' }}>
                <div style={{ height:'100%', width: `${pct}%`, background: stateColor, transition:'width .3s' }}/>
              </div>
            </div>
            {mode !== 'simple' && (
              <div style={{ display:'flex', gap: 16, fontSize: 11, color:'var(--dim)', fontFamily:'var(--font-mono)', whiteSpace:'nowrap' }}>
                <span>iter <b style={{color:'var(--fg)'}}>{p.iterUsed}/{p.iterCap}</b></span>
                <span>${p.spentUsd.toFixed(2)}/<b style={{color: budgetPct>80?'var(--warn)':'var(--fg)'}}>${p.budgetUsd.toFixed(2)}</b></span>
                <span>×{p.concurrency}</span>
                <span style={{ color:'var(--dim)' }}>{p.eta}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display:'flex', gap: 6, alignItems:'center' }}>
          {p.state === 'running' && <>
            <Btn size="sm" variant="ghost" icon={Icon.pause}>Pause</Btn>
            <Btn size="sm" variant="ghost" icon={Icon.stop}>Stop</Btn>
          </>}
          {p.state === 'paused' && <>
            <Btn size="sm" variant="primary" icon={Icon.play}>Resume</Btn>
            <Btn size="sm" variant="ghost" icon={Icon.stop}>Stop</Btn>
          </>}
          {p.state === 'queued' && <>
            <Btn size="sm" variant="primary" icon={Icon.play}>Start now</Btn>
            <Btn size="sm" variant="ghost">Edit</Btn>
          </>}
          {p.state === 'done' && <>
            <Btn size="sm" variant="secondary">View report</Btn>
            <Btn size="sm" variant="ghost">Clone</Btn>
          </>}
          <button onClick={onToggle} aria-label="toggle details" style={{
            background:'transparent', border:'1px solid var(--border)', color:'var(--dim)',
            borderRadius: 4, padding:'6px 8px', cursor:'pointer', fontFamily:'inherit',
            transform: expanded ? 'rotate(180deg)' : 'none', transition:'transform .2s',
          }}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 3L5 7L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop:'1px solid var(--border)', background:'var(--surface-2)', padding:'12px 16px' }}>
          {p.tasks.length > 0 ? (
            <div style={{ display:'grid', gap: 4 }}>
              <div style={{ fontSize: 10, textTransform:'uppercase', letterSpacing: 1.2, color:'var(--dim)', fontWeight:600, marginBottom: 6 }}>
                Pipeline tasks ({p.tasks.length})
              </div>
              {p.tasks.map((t, i) => <PipelineTaskRow key={t.id} task={t} idx={i+1}/>)}
            </div>
          ) : (
            <div style={{ fontSize: 12, color:'var(--dim)', fontStyle:'italic' }}>
              Tasks will be generated from the PRD when this pipeline starts.
            </div>
          )}

          {mode === 'advanced' && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <MiniKV label="Concurrency" value={`${p.concurrency} agent${p.concurrency===1?'':'s'}`}/>
              <MiniKV label="Iter cap" value={`${p.iterCap}`}/>
              <MiniKV label="Budget" value={`$${p.budgetUsd.toFixed(2)}`}/>
              <MiniKV label="Started" value={p.started}/>
              <MiniKV label="Autonomy" value={p.autonomy}/>
              <MiniKV label="Preset" value={p.preset}/>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineTaskRow({ task, idx }) {
  const statusColor = {
    done:'var(--ok)', in_progress:'var(--accent)', blocked:'var(--warn)', todo:'var(--dim)', failed:'var(--bad)',
  }[task.status] || 'var(--dim)';
  const statusIcon = {
    done: '●', in_progress: '◐', blocked: '◌', todo: '○', failed: '✕',
  }[task.status] || '○';
  return (
    <div style={{
      display:'grid', gridTemplateColumns:'28px 80px 1fr auto', gap: 10, alignItems:'center',
      padding:'6px 8px', fontSize: 12, borderRadius: 4,
      background: task.status === 'in_progress' ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent',
    }}>
      <span style={{ fontFamily:'var(--font-mono)', fontSize: 11, color:'var(--dim)' }}>{String(idx).padStart(2,'0')}</span>
      <span style={{ fontFamily:'var(--font-mono)', fontSize: 11, color:'var(--accent)' }}>{task.id}</span>
      <span style={{ color:'var(--fg)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.title}</span>
      <span style={{ display:'inline-flex', alignItems:'center', gap: 5, fontSize: 11, color: statusColor, fontWeight: 500, textTransform:'capitalize' }}>
        <span style={{ fontSize: 10 }}>{statusIcon}</span>
        {task.status.replace('_',' ')}
      </span>
    </div>
  );
}

function MiniKV({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, textTransform:'uppercase', letterSpacing:1.2, color:'var(--dim)', fontWeight:600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color:'var(--fg)', fontFamily:'var(--font-mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value}</div>
    </div>
  );
}

window.Pipelines = Pipelines;

// Compact inline summary used on the Now/Overview tab.
function ActivePipelineStrip({ data, onOpen }) {
  const pipelines = data.pipelines || [];
  const running = pipelines.filter(p => p.state === 'running');
  const paused = pipelines.filter(p => p.state === 'paused');
  const queued = pipelines.filter(p => p.state === 'queued');
  const active = running[0] || paused[0] || queued[0];
  if (!active) return null;

  const pct = active.progress.total > 0 ? Math.round((active.progress.done / active.progress.total) * 100) : 0;
  const stateColor = { running:'var(--ok)', paused:'var(--warn)', queued:'var(--dim)' }[active.state] || 'var(--dim)';

  return (
    <Card padding="14px 16px" style={{ borderLeft:`3px solid ${stateColor}` }}>
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0, 1fr) auto', gap: 14, alignItems:'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 6, flexWrap:'wrap' }}>
            <span style={{ fontSize: 10, textTransform:'uppercase', letterSpacing:1.4, color:'var(--dim)', fontWeight:600 }}>Active pipeline</span>
            <StatusPill kind={active.state === 'running' ? 'running' : active.state === 'paused' ? 'warn' : 'idle'} small>{active.state}</StatusPill>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{active.emoji} {active.name}</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'minmax(140px, 1fr) auto', gap: 12, alignItems:'center' }}>
            <div>
              <div style={{ height: 5, background:'var(--surface-2)', borderRadius: 3, overflow:'hidden' }}>
                <div style={{ height:'100%', width: `${pct}%`, background: stateColor }}/>
              </div>
            </div>
            <div style={{ display:'flex', gap: 12, fontSize: 11, color:'var(--dim)', fontFamily:'var(--font-mono)', whiteSpace:'nowrap' }}>
              <span>{active.progress.done}/{active.progress.total} tasks</span>
              <span>${active.spentUsd.toFixed(2)}/${active.budgetUsd.toFixed(2)}</span>
              <span>{active.eta}</span>
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {(paused.length + queued.length) > 0 && (
            <span style={{ fontSize: 11, color:'var(--dim)', marginRight: 6 }}>
              +{paused.length} paused · {queued.length} queued
            </span>
          )}
          <Btn size="sm" variant="secondary" onClick={onOpen}>Open pipelines</Btn>
        </div>
      </div>
    </Card>
  );
}

window.ActivePipelineStrip = ActivePipelineStrip;

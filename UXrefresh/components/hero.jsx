// The "Now" hero — one-glance health surface shown at top of every mode.
// Explains in plain English (Simple mode) and agent/phase detail (Standard/Advanced).

const { useMemo: useHeroMemo } = React;

const PHASES = ['inspect','select','prompt','execute','verify','classify','persist'];

function PhaseTracker({ active, agentId, iteration, compact }) {
  const idx = PHASES.indexOf(active);
  return (
    <div style={{ display:'flex', alignItems:'center', gap: compact ? 4 : 6, flexWrap:'wrap' }}>
      {PHASES.map((p, i) => {
        const done = i < idx;
        const now = i === idx;
        return (
          <React.Fragment key={p}>
            <div style={{
              display:'flex', alignItems:'center', gap: 5,
              padding: compact ? '3px 7px' : '4px 9px',
              borderRadius: 5,
              fontSize: compact ? 10 : 11,
              background: now ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : done ? 'var(--surface-2)' : 'transparent',
              color: now ? 'var(--accent)' : done ? 'var(--fg)' : 'var(--dim)',
              border: `1px solid ${now ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : done ? 'var(--border)' : 'transparent'}`,
              fontWeight: now ? 600 : 400,
              letterSpacing: 0.2,
              textTransform: 'lowercase',
            }}>
              {done && <span style={{opacity:0.7}}>✓</span>}
              {now && <span style={{
                display:'inline-block', width:6, height:6, borderRadius:'50%',
                background:'var(--accent)',
                animation:'ralph-blink 1.1s ease-in-out infinite',
              }}/>}
              {p}
            </div>
            {i < PHASES.length-1 && <span style={{color:'var(--border)', fontSize:9}}>─</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function HeroNow({ data, mode, onToggleLoop }) {
  const running = data.loopState === 'running';
  const pct = Math.round((data.iteration.current / data.iteration.cap) * 100);
  const doneCount = data.counts.done;
  const totalCount = Object.values(data.counts).reduce((a,b)=>a+b,0) - data.counts.dead_letter;
  const donePct = Math.round((doneCount / totalCount) * 100);

  const agent = data.agents[0];

  const primaryExplain = running
    ? `Ralph is working on "${data.currentTask.title}" — iteration ${data.iteration.current} of ${data.iteration.cap}.`
    : `Ralph is idle. ${doneCount} of ${totalCount} tasks done.`;

  return (
    <Card accent padding="20px 22px" style={{ gap: 16 }}>
      <div style={{ display:'flex', gap:16, alignItems:'flex-start', flexWrap:'wrap' }}>
        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: 8 }}>
            <HealthPulse state={data.loopState}/>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--dim)' }}>
              Now
            </span>
            <StatusPill kind={running ? 'running' : 'idle'} small>
              {running ? 'Loop running' : 'Loop idle'}
            </StatusPill>
            {running && (
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>
                iteration <b style={{color:'var(--fg)'}}>{data.iteration.current}</b> / {data.iteration.cap}
              </span>
            )}
          </div>

          {mode === 'simple' ? (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.25, margin:'0 0 4px 0', letterSpacing: -0.3 }}>
                {primaryExplain}
              </h2>
              <p style={{ fontSize: 13, color:'var(--dim)', margin:0, maxWidth: 640 }}>
                {running
                  ? `${agent.role} agent is ${agent.phase}ing the code. It will verify the tests and commit when done.`
                  : `Press Start to have Ralph pick up the highest-priority task automatically.`}
              </p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 4 }}>Current task</div>
              <h2 style={{ fontSize: 19, fontWeight: 500, lineHeight: 1.3, margin:'0 0 10px 0', letterSpacing: -0.2, display:'flex', gap: 10, alignItems:'baseline', flexWrap:'wrap' }}>
                <span style={{
                  fontFamily:'var(--font-mono)', fontSize: 12, padding:'3px 8px',
                  background:'var(--surface-2)', border:'1px solid var(--border)',
                  borderRadius: 4, color:'var(--accent)',
                }}>{data.currentTask.id}</span>
                <span>{data.currentTask.title}</span>
              </h2>
              <PhaseTracker active={agent.phase} iteration={agent.iteration} agentId={agent.id}/>
            </>
          )}
        </div>

        <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
          {running ? (
            <>
              <Btn variant="danger" size="md" icon={Icon.stop} onClick={()=>onToggleLoop && onToggleLoop()}>Stop loop</Btn>
              <Btn variant="ghost" size="md" icon={Icon.pause}>Pause</Btn>
            </>
          ) : (
            <Btn variant="primary" size="md" icon={Icon.play} onClick={()=>onToggleLoop && onToggleLoop()}>Start loop</Btn>
          )}
          {mode !== 'simple' && <Btn variant="secondary" size="md" icon={Icon.bolt}>Run one iteration</Btn>}
        </div>
      </div>

      {/* Health strip: overall workspace signals */}
      <div style={{
        display:'grid', gap: 0,
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))',
        border:'1px solid var(--border)', borderRadius: 8, overflow:'hidden',
        background:'var(--surface-2)',
      }}>
        <HealthCell label="Progress" value={`${doneCount}/${totalCount}`} sub={`${donePct}% done`} bar={donePct} color="var(--ok)"/>
        <HealthCell label="Iteration" value={`${data.iteration.current}/${data.iteration.cap}`} sub={`${pct}% of cap`} bar={pct} color="var(--accent)"/>
        <HealthCell label="Attention" value={(data.counts.blocked + data.deadLetter.length) + ''} sub={`${data.counts.blocked} blocked · ${data.deadLetter.length} dead-letter`} tone={(data.counts.blocked+data.deadLetter.length)>0 ? 'warn' : 'ok'}/>
        <HealthCell label="Cost this loop" value={`$${data.cost.loop.toFixed(2)}`} sub={`$${data.cost.today.toFixed(2)} today`}/>
      </div>
    </Card>
  );
}

function HealthCell({ label, value, sub, bar, color = 'var(--accent)', tone = 'neutral' }) {
  const toneColor = tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : 'var(--fg)';
  return (
    <div style={{
      padding:'14px 16px',
      borderRight:'1px solid var(--border)',
      display:'flex', flexDirection:'column', gap: 4,
    }}>
      <span style={{fontSize:10, textTransform:'uppercase', letterSpacing:1.2, color:'var(--dim)', fontWeight:600}}>{label}</span>
      <span style={{fontSize: 22, fontWeight: 500, color: toneColor, letterSpacing:-0.3, fontFamily:'var(--font-mono)'}}>{value}</span>
      <span style={{fontSize:11, color:'var(--dim)'}}>{sub}</span>
      {typeof bar === 'number' && (
        <div style={{ height:3, background:'var(--border)', borderRadius: 2, overflow:'hidden', marginTop: 2 }}>
          <div style={{ height:'100%', width: `${bar}%`, background: color, transition:'width 0.4s' }}/>
        </div>
      )}
    </div>
  );
}

window.HeroNow = HeroNow;
window.PhaseTracker = PhaseTracker;

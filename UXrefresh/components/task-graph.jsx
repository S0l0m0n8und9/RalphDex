// Task graph — renders the hierarchy + dependency edges as a SVG graph
// plus a list view. Shows why Ralph picked the current task.

const { useState: useGraphState } = React;

function TaskGraph({ data, onSelect, selectedId }) {
  // Layout: parent -> children vertically by dependency order
  // Hand-tuned layout (simple and readable for a demo graph of ~7 nodes).
  const nodes = [
    { id: 'T-4119', x: 60,  y: 40,  col: 0, title: 'webhook parser' },
    { id: 'T-4120', x: 60,  y: 120, col: 0, title: 'stripe secrets' },
    { id: 'T-4100', x: 260, y: 80,  col: 1, title: 'harden webhook (epic)', epic: true },
    { id: 'T-4127', x: 480, y: 30,  col: 2, title: 'retry backoff' },
    { id: 'T-4131', x: 480, y: 110, col: 2, title: 'idempotency keys' },
    { id: 'T-4141', x: 480, y: 190, col: 2, title: 'dead-letter route' },
    { id: 'T-4156', x: 700, y: 190, col: 3, title: 'on-call runbook' },
  ];
  const edges = [
    { from: 'T-4119', to: 'T-4127' },
    { from: 'T-4100', to: 'T-4127', parent: true },
    { from: 'T-4100', to: 'T-4131', parent: true },
    { from: 'T-4100', to: 'T-4141', parent: true },
    { from: 'T-4127', to: 'T-4131' },
    { from: 'T-4131', to: 'T-4141' },
    { from: 'T-4141', to: 'T-4156' },
  ];

  const byId = Object.fromEntries(data.tasks.map(t => [t.id, t]));
  const statusColor = s => s === 'done' ? 'var(--ok)' : s === 'blocked' ? 'var(--warn)' : s === 'in_progress' ? 'var(--accent)' : 'var(--dim)';

  return (
    <div style={{ position: 'relative', background: 'var(--surface-2)', border:'1px solid var(--border)', borderRadius: 8, padding: 8, overflowX:'auto' }}>
      <svg viewBox="0 0 820 260" preserveAspectRatio="xMidYMid meet" style={{ width:'100%', minWidth: 640, height: 260, display:'block' }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="var(--dim)"/>
          </marker>
          <marker id="arrow-p" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="var(--accent)"/>
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = nodes.find(n => n.id === e.from);
          const b = nodes.find(n => n.id === e.to);
          if (!a || !b) return null;
          const dx = (b.x - a.x) / 2;
          const path = `M ${a.x+140} ${a.y+20} C ${a.x+140+dx} ${a.y+20}, ${b.x-dx} ${b.y+20}, ${b.x} ${b.y+20}`;
          return (
            <path key={i} d={path}
              stroke={e.parent ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'var(--border)'}
              strokeWidth={e.parent ? 1.5 : 1}
              strokeDasharray={e.parent ? '3 3' : 'none'}
              fill="none"
              markerEnd={`url(#${e.parent ? 'arrow-p' : 'arrow'})`}/>
          );
        })}
        {nodes.map(n => {
          const t = byId[n.id];
          if (!t) return null;
          const selected = selectedId === n.id;
          const current = t.current;
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{cursor:'pointer'}} onClick={()=>onSelect && onSelect(n.id)}>
              <rect
                x={0} y={0} width={140} height={40} rx={6}
                fill={current ? 'color-mix(in srgb, var(--accent) 14%, var(--surface))' : 'var(--surface)'}
                stroke={selected ? 'var(--accent)' : current ? 'var(--accent)' : 'var(--border)'}
                strokeWidth={selected || current ? 1.5 : 1}
              />
              <circle cx={10} cy={20} r={4} fill={statusColor(t.status)} />
              <text x={20} y={16} fontSize="10" fill="var(--fg)" style={{fontFamily:'var(--font-mono)', fontWeight:600}}>{t.id}</text>
              <text x={20} y={30} fontSize="10" fill="var(--dim)" style={{letterSpacing:0.1}}>
                {n.title.length > 17 ? n.title.slice(0,17)+'…' : n.title}
              </text>
              {current && (
                <circle cx={132} cy={8} r={3.5} fill="var(--accent)">
                  <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite"/>
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      <div style={{ display:'flex', gap: 14, fontSize: 10, color:'var(--dim)', padding:'6px 10px', borderTop:'1px solid var(--border)', marginTop: 4 }}>
        <LegendDot color="var(--ok)" label="done"/>
        <LegendDot color="var(--accent)" label="in progress"/>
        <LegendDot color="var(--warn)" label="blocked"/>
        <LegendDot color="var(--dim)" label="todo"/>
        <span style={{flex:1}}/>
        <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
          <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="var(--accent)" strokeDasharray="2 2"/></svg>
          parent → child
        </span>
        <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
          <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="var(--dim)"/></svg>
          depends on
        </span>
      </div>
    </div>
  );
}

function LegendDot({color, label}) {
  return (
    <span style={{display:'inline-flex', alignItems:'center', gap:5}}>
      <span style={{width:6, height:6, borderRadius:'50%', background:color}}/> {label}
    </span>
  );
}

function TaskRow({ task, expanded, onToggle, isSelected }) {
  const statusColor = task.status === 'done' ? 'var(--ok)' : task.status === 'blocked' ? 'var(--warn)' : task.status === 'in_progress' ? 'var(--accent)' : 'var(--dim)';
  const statusLabel = task.status.replace('_',' ');
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button onClick={onToggle} style={{
        width:'100%', display:'flex', alignItems:'center', gap:10,
        padding:'10px 4px', background: isSelected ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent',
        border:'none', color:'var(--fg)', cursor:'pointer', textAlign:'left',
        fontFamily:'inherit',
      }}>
        <span style={{width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink:0}}/>
        <span style={{
          fontFamily:'var(--font-mono)', fontSize: 11, width: 52, flexShrink:0,
          color:'var(--dim)',
        }}>{task.id}</span>
        <span style={{ flex: 1, fontSize: 13, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {task.title}
          {task.current && <StatusPill kind="accent" small><span style={{marginLeft:0}}>● current</span></StatusPill>}
        </span>
        <span style={{
          fontSize: 10, textTransform:'uppercase', letterSpacing:0.8,
          color: statusColor, fontWeight: 600, width: 84, textAlign:'right',
        }}>{statusLabel}</span>
        <span style={{color:'var(--dim)', fontSize: 10, transition:'transform 0.15s', transform: expanded?'rotate(90deg)':'rotate(0)'}}>▸</span>
      </button>
      {expanded && (
        <div style={{ padding:'0 4px 14px 70px', fontSize:12, color:'var(--fg-dim)', display:'grid', gap: 6 }}>
          {task.notes && <Row label="notes" value={task.notes}/>}
          {task.blocker && <Row label="blocker" value={task.blocker} tone="warn"/>}
          {task.validation && <Row label="validation" value={task.validation} mono/>}
          {task.parent && <Row label="parent" value={task.parent} mono/>}
          {task.children.length > 0 && <Row label="children" value={task.children.join(', ')} mono/>}
          {task.depends.length > 0 && <Row label="depends on" value={task.depends.join(', ')} mono/>}
          <Row label="priority" value={task.priority}/>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono, tone }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'92px 1fr', gap: 12, fontSize: 12 }}>
      <span style={{color:'var(--dim)', fontSize:10, textTransform:'uppercase', letterSpacing:1, paddingTop:2}}>{label}</span>
      <span style={{
        color: tone === 'warn' ? 'var(--warn)' : 'var(--fg)',
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        fontSize: mono ? 11 : 12,
        lineHeight: 1.5,
      }}>{value}</span>
    </div>
  );
}

function TaskPanel({ data, selectedId, onSelect }) {
  const [expanded, setExpanded] = useGraphState(selectedId || 'T-4127');
  const activeTasks = data.tasks.filter(t => t.status !== 'done');
  const doneTasks = data.tasks.filter(t => t.status === 'done');
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: 14 }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--dim)', margin: 0, flex:1 }}>Task Graph</h3>
        <StatusPill small kind="neutral">{data.tasks.length} tasks</StatusPill>
        <Btn size="sm" variant="secondary" icon={Icon.plus}>Add task</Btn>
      </div>
      <TaskGraph data={data} onSelect={(id)=>{ setExpanded(id); onSelect && onSelect(id); }} selectedId={expanded}/>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, textTransform:'uppercase', letterSpacing:1.2, color:'var(--dim)', fontWeight:600, marginBottom: 4 }}>Active ({activeTasks.length})</div>
        {activeTasks.map(t => (
          <TaskRow key={t.id} task={t}
            expanded={expanded === t.id}
            isSelected={expanded === t.id}
            onToggle={()=>{ setExpanded(expanded===t.id?null:t.id); onSelect && onSelect(t.id); }}
          />
        ))}
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 10, textTransform:'uppercase', letterSpacing:1.2, color:'var(--dim)', fontWeight:600, cursor:'pointer', padding:'6px 0' }}>
            Completed ({doneTasks.length})
          </summary>
          {doneTasks.map(t => (
            <TaskRow key={t.id} task={t}
              expanded={expanded === t.id}
              isSelected={expanded === t.id}
              onToggle={()=>setExpanded(expanded===t.id?null:t.id)}
            />
          ))}
        </details>
      </div>
    </div>
  );
}

window.TaskPanel = TaskPanel;
window.TaskGraph = TaskGraph;

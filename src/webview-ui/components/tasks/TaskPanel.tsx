import React, { useState } from 'react';
import type { RalphDashboardTask } from '../../../ui/uiTypes';
import { StatusPill } from '../primitives/Card';

interface TaskPanelProps {
  tasks: RalphDashboardTask[];
}

const STATUS_COLOR: Record<RalphDashboardTask['status'], string> = {
  in_progress: 'var(--rdx-accent)',
  blocked:     'var(--rdx-warn)',
  todo:        'var(--rdx-dim)',
  done:        'var(--rdx-ok)',
};

function TaskRow({ task }: { task: RalphDashboardTask }) {
  const [open, setOpen] = useState(false);
  const color = STATUS_COLOR[task.status];
  return (
    <div style={{ borderBottom: '1px solid var(--rdx-border)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          padding: '9px 4px',
          background: 'transparent', border: 'none',
          color: 'var(--rdx-fg)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--rdx-mono)', fontSize: 11, width: 52, flexShrink: 0, color: 'var(--rdx-dim)' }}>
          {task.id}
        </span>
        <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.title}
          {task.isCurrent && (
            <StatusPill kind="accent" small>current</StatusPill>
          )}
        </span>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color, fontWeight: 600, marginLeft: 4 }}>
          {task.status.replace('_', ' ')}
        </span>
        <span style={{ color: 'var(--rdx-dim)', fontSize: 10, marginLeft: 4 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 4px 12px 70px', fontSize: 12, color: 'var(--rdx-dim)', display: 'grid', gap: 5 }}>
          {task.blocker && (
            <DetailRow label="blocker" value={task.blocker} color="var(--rdx-warn)" />
          )}
          {task.notes && <DetailRow label="notes" value={task.notes} />}
          {task.validation && <DetailRow label="validation" value={task.validation} mono />}
          {task.parentId && <DetailRow label="parent" value={task.parentId} mono />}
          {task.childIds.length > 0 && <DetailRow label="children" value={task.childIds.join(', ')} mono />}
          {task.dependsOn.length > 0 && <DetailRow label="depends on" value={task.dependsOn.join(', ')} mono />}
          <DetailRow label="priority" value={task.priority} />
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, paddingTop: 2 }}>{label}</span>
      <span style={{ color: color ?? 'var(--rdx-fg)', fontFamily: mono ? 'var(--rdx-mono)' : 'inherit', fontSize: mono ? 11 : 12, lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  );
}

export function TaskPanel({ tasks }: TaskPanelProps) {
  if (tasks.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--rdx-dim)', fontSize: 13 }}>
        No tasks · add a PRD to get started
      </div>
    );
  }

  const active = tasks.filter(t => t.status !== 'done');
  const done   = tasks.filter(t => t.status === 'done');

  return (
    <div>
      {/* SVG task graph deferred — no dynamic layout solver */}
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--rdx-dim)', fontWeight: 600, marginBottom: 4 }}>
        Active ({active.length})
      </div>
      {active.map(t => <TaskRow key={t.id} task={t} />)}
      {done.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--rdx-dim)', fontWeight: 600, cursor: 'pointer', padding: '6px 0' }}>
            Completed ({done.length})
          </summary>
          {done.map(t => <TaskRow key={t.id} task={t} />)}
        </details>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import type { RalphDashboardTask, RalphDashboardTaskSeedingState } from '../../../ui/uiTypes';
import { Card, StatusPill, Btn, Icon } from '../primitives/Card';

interface TaskPanelProps {
  tasks: RalphDashboardTask[];
  taskSeeding: RalphDashboardTaskSeedingState;
  onSeedTasks: (requestText: string) => void;
}

const STATUS_COLOR: Record<RalphDashboardTask['status'], string> = {
  in_progress: 'var(--accent)',
  blocked:     'var(--warn)',
  todo:        'var(--dim)',
  done:        'var(--ok)',
};

const STATUS_ICON: Record<RalphDashboardTask['status'], string> = {
  in_progress: '◐',
  blocked:     '◌',
  todo:        '○',
  done:        '●',
};

function TaskRow({ task }: { task: RalphDashboardTask }) {
  const [open, setOpen] = useState(false);
  const color = STATUS_COLOR[task.status];
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 6,
      background: task.isCurrent ? 'color-mix(in srgb, var(--accent) 5%, var(--surface-2))' : 'var(--surface-2)',
      borderLeft: task.isCurrent ? '3px solid var(--accent)' : '3px solid transparent',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          padding: '9px 12px',
          background: 'transparent', border: 'none',
          color: 'var(--fg)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 12, color, flexShrink: 0 }}>{STATUS_ICON[task.status]}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, width: 60, flexShrink: 0, color: 'var(--accent)' }}>
          {task.id}
        </span>
        <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.title}
        </span>
        {task.isCurrent && (
          <StatusPill kind="accent" small>current</StatusPill>
        )}
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color, fontWeight: 600, marginLeft: 4, flexShrink: 0 }}>
          {task.status.replace('_', ' ')}
        </span>
        <span style={{ color: 'var(--dim)', fontSize: 10, marginLeft: 4, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 12px 81px', fontSize: 12, color: 'var(--dim)', display: 'grid', gap: 5 }}>
          {task.blocker && (
            <DetailRow label="blocker" value={task.blocker} color="var(--warn)" />
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
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, paddingTop: 2, color: 'var(--dim)' }}>{label}</span>
      <span style={{ color: color ?? 'var(--fg)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontSize: mono ? 11 : 12, lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  );
}

function StatusChip({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
      <span style={{ fontSize: 20, fontWeight: 300, color, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{count}</span>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--dim)', fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function SeedCard({ seeding, onSeedTasks }: { seeding: RalphDashboardTaskSeedingState; onSeedTasks: (t: string) => void }) {
  const [text, setText] = useState(seeding.requestText ?? '');
  const submitting = seeding.phase === 'submitting';

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    onSeedTasks(trimmed);
  };

  const resultColor = seeding.phase === 'success' ? 'var(--ok)' : seeding.phase === 'error' ? 'var(--bad)' : 'var(--dim)';

  return (
    <Card padding="16px 18px">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: 'var(--accent)', display: 'flex' }}>{Icon.plus}</span>
        <h3 style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--dim)', margin: 0 }}>
          Seed from Epic
        </h3>
      </div>
      <p style={{ fontSize: 12, color: 'var(--dim)', margin: '0 0 10px', lineHeight: 1.5 }}>
        Describe a high-level feature or epic and Ralph will generate backlog tasks from it.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.currentTarget.value)}
        disabled={submitting}
        placeholder="e.g. Add OAuth2 login with GitHub and Google providers, including token refresh and session management."
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
        style={{
          width: '100%', minHeight: 80, resize: 'vertical',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '8px 10px',
          color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13,
          lineHeight: 1.5, outline: 'none', boxSizing: 'border-box',
          opacity: submitting ? 0.6 : 1,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <Btn variant="primary" size="sm" onClick={submit} disabled={submitting || !text.trim()}>
          {submitting ? 'Generating…' : <>{Icon.bolt}<span>Generate tasks</span></>}
        </Btn>
        <span style={{ fontSize: 11, color: 'var(--dim)' }}>⌘↵ to submit</span>
        {seeding.phase !== 'idle' && seeding.message && (
          <span style={{ fontSize: 12, color: resultColor, flex: 1, textAlign: 'right' }}>
            {seeding.message}
            {seeding.createdTaskCount != null && ` (${seeding.createdTaskCount} tasks)`}
          </span>
        )}
      </div>
    </Card>
  );
}

export function TaskPanel({ tasks, taskSeeding, onSeedTasks }: TaskPanelProps) {
  const todo       = tasks.filter(t => t.status === 'todo');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const blocked    = tasks.filter(t => t.status === 'blocked');
  const done       = tasks.filter(t => t.status === 'done');
  const active     = [...inProgress, ...blocked, ...todo];

  if (tasks.length === 0) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>
          No tasks yet · seed from an epic below or open the PRD wizard
        </div>
        <SeedCard seeding={taskSeeding} onSeedTasks={onSeedTasks} />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card accent padding="16px 20px">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'var(--dim)', fontWeight: 600, marginBottom: 4 }}>Task Board</div>
            <h2 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 2px', lineHeight: 1.2 }}>
              {done.length}/{tasks.length} done
            </h2>
            <p style={{ fontSize: 12, color: 'var(--dim)', margin: 0 }}>
              {inProgress.length > 0 ? `${inProgress.length} in progress` : active.length > 0 ? `${active.length} remaining` : 'All tasks complete'}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: 20 }}>
            <StatusChip count={inProgress.length} label="In Progress" color="var(--accent)" />
            <StatusChip count={blocked.length}    label="Blocked"     color="var(--warn)"   />
            <StatusChip count={todo.length}       label="Todo"        color="var(--dim)"    />
            <StatusChip count={done.length}       label="Done"        color="var(--ok)"     />
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--dim)', fontWeight: 600, marginBottom: 2 }}>
          Active ({active.length})
        </div>
        {active.map(t => <TaskRow key={t.id} task={t} />)}
      </div>

      {done.length > 0 && (
        <details>
          <summary style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--dim)', fontWeight: 600, cursor: 'pointer', padding: '4px 0', userSelect: 'none' }}>
            Completed ({done.length})
          </summary>
          <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            {done.map(t => <TaskRow key={t.id} task={t} />)}
          </div>
        </details>
      )}

      <SeedCard seeding={taskSeeding} onSeedTasks={onSeedTasks} />
    </div>
  );
}

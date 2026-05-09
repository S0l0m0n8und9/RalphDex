import React from 'react';
import type { RalphAgentLaneState } from '../../../ui/uiTypes';
import { Card } from '../primitives/Card';
import { PhaseTracker } from '../hero/PhaseTracker';

interface AgentLanesProps {
  lanes: RalphAgentLaneState[];
}

function roleColor(agentId: string): string {
  const id = agentId.toLowerCase();
  if (id.includes('reviewer')) return 'var(--rdx-ok)';
  if (id.includes('watchdog')) return 'var(--rdx-warn)';
  if (id.includes('scm'))      return 'var(--rdx-cyan)';
  return 'var(--rdx-accent)';
}

export function AgentLanes({ lanes }: AgentLanesProps) {
  if (lanes.length === 0) return null;
  return (
    <Card title="Agent Lanes" subtitle={`${lanes.length} active agent${lanes.length === 1 ? '' : 's'}`}>
      <div style={{ display: 'grid', gap: 7 }}>
        {lanes.map(lane => (
          <div key={lane.agentId} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '9px 11px',
            border: '1px solid var(--rdx-border)',
            borderLeft: `3px solid ${roleColor(lane.agentId)}`,
            borderRadius: 6,
            background: 'var(--rdx-surface-2)',
          }}>
            <div style={{ minWidth: 100, flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--rdx-mono)', fontSize: 12, fontWeight: 600, color: 'var(--rdx-fg)' }}>
                {lane.agentId}
              </div>
              {lane.iteration != null && (
                <div style={{ fontSize: 10, color: 'var(--rdx-dim)', marginTop: 1 }}>
                  iter <span style={{ color: 'var(--rdx-fg)', fontFamily: 'var(--rdx-mono)' }}>{lane.iteration}</span>
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PhaseTracker phase={lane.phase} compact />
            </div>
            {lane.message && (
              <div style={{
                fontSize: 11, color: 'var(--rdx-dim)', maxWidth: 200,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {lane.message}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

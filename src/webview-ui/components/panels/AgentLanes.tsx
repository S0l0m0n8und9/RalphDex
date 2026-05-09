import React from 'react';
import type { RalphAgentLaneState } from '../../../ui/uiTypes';
import { Card } from '../primitives/Card';
import { PhaseTracker } from '../hero/PhaseTracker';

interface AgentLanesProps {
  lanes: RalphAgentLaneState[];
}

function roleColor(agentId: string): string {
  const id = agentId.toLowerCase();
  if (id.includes('reviewer')) return 'var(--ok)';
  if (id.includes('watchdog')) return 'var(--warn)';
  if (id.includes('scm'))      return 'var(--cyan)';
  return 'var(--accent)';
}

function roleLabel(agentId: string): string {
  const id = agentId.toLowerCase();
  if (id.includes('reviewer')) return 'reviewer';
  if (id.includes('watchdog')) return 'watchdog';
  if (id.includes('scm'))      return 'scm';
  if (id.includes('planner'))  return 'planner';
  return 'implementer';
}

export function AgentLanes({ lanes }: AgentLanesProps) {
  if (lanes.length === 0) return null;
  return (
    <Card title="Agent Lanes" subtitle={`${lanes.length} concurrent agent${lanes.length === 1 ? '' : 's'}`}>
      <div style={{ display: 'grid', gap: 8 }}>
        {lanes.map(lane => {
          const rc = roleColor(lane.agentId);
          const rl = roleLabel(lane.agentId);
          return (
            <div key={lane.agentId} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${rc}`,
              borderRadius: 8,
              background: 'var(--surface-2)',
            }}>
              <div style={{ minWidth: 120, flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>
                  {lane.agentId}
                </div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: rc, fontWeight: 600, marginTop: 1 }}>
                  {rl}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <PhaseTracker phase={lane.phase} compact />
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--dim)', whiteSpace: 'nowrap' }}>
                {lane.iteration != null && (
                  <span>iter <b style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>{lane.iteration}</b></span>
                )}
                {lane.message && (
                  <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lane.message}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

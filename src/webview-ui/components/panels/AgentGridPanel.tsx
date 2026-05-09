import React from 'react';
import type { AgentGridSection } from '../../../webview/dashboardSnapshot';
import { Card, StatusPill, Btn } from '../primitives/Card';

interface AgentGridPanelProps {
  agentGrid: AgentGridSection;
  onCommand: (command: string) => void;
}

function formatUtc(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function AgentGridPanel({ agentGrid, onCommand }: AgentGridPanelProps) {
  const { rows } = agentGrid;

  if (rows.length === 0) {
    return (
      <Card title="Agent Grid">
        <p style={{ fontSize: 12, color: 'var(--dim)', margin: '0 0 12px' }}>
          No durable agent identity records found yet.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn size="sm" variant="secondary" onClick={() => onCommand('ralphCodex.runMultiAgentLoop')}>
            Run Multi-Agent Loop
          </Btn>
          <Btn size="sm" variant="secondary" onClick={() => onCommand('ralphCodex.showRalphStatus')}>
            Show Status
          </Btn>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Agent Grid">
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map(row => (
          <div key={row.agentId} style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 6, padding: 10,
            borderLeft: row.isStuck ? '3px solid var(--warn)' : '3px solid transparent',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                {row.agentId}
              </span>
              {row.isStuck && (
                <StatusPill kind="warn" small>stuck {row.stuckScore}</StatusPill>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>
                {row.completedTaskCount} done
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11, color: 'var(--dim)' }}>
              <div>
                <span style={{ opacity: 0.7 }}>Claim </span>
                <span style={{ color: row.activeClaimTaskId ? 'var(--accent)' : 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
                  {row.activeClaimTaskId ?? 'idle'}
                </span>
              </div>
              <div>
                <span style={{ opacity: 0.7 }}>Latest </span>
                <span style={{ color: 'var(--fg)' }}>
                  {row.latestHandoffClassification ?? 'none'}
                  {row.latestHandoffIteration != null && ` · iter ${row.latestHandoffIteration}`}
                </span>
              </div>
              <div>
                <span style={{ opacity: 0.7 }}>First seen </span>
                <span>{formatUtc(row.firstSeenAt)}</span>
              </div>
              {row.noProgressHeatmap && (
                <div>
                  <span style={{ opacity: 0.7 }}>Heatmap </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{row.noProgressHeatmap}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

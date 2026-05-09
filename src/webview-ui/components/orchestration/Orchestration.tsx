import React from 'react';
import type { DashboardCostSection } from '../../../webview/dashboardSnapshot';
import { Card, formatBytes } from '../primitives/Card';
import { HealthCell } from '../hero/HealthCell';

interface OrchestrationProps {
  cost: DashboardCostSection;
}

export function Orchestration({ cost }: OrchestrationProps) {
  if (!cost.promptCacheStats) return null;
  const stats = cost.promptCacheStats;
  const cacheHitLabel =
    stats.cacheHit === null ? 'no cache data' :
    stats.cacheHit ? 'cache hit' : 'cache miss';

  return (
    <Card title="Orchestration · Cache">
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        border: '1px solid var(--rdx-border)', borderRadius: 6,
        overflow: 'hidden', background: 'var(--rdx-surface-2)',
      }}>
        <HealthCell
          label="Prompt prefix"
          value={formatBytes(stats.staticPrefixBytes)}
          sub="static context size"
        />
        <HealthCell
          label="Last call"
          value={cacheHitLabel}
          sub="provider cache status"
          tone={stats.cacheHit === true ? 'ok' : stats.cacheHit === false ? 'neutral' : 'neutral'}
        />
      </div>
      {/* Policy rules, model routing, raw log: deferred — no backing data in state */}
    </Card>
  );
}

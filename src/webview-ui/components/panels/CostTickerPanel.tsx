import React from 'react';
import type { DashboardCostSection } from '../../../webview/dashboardSnapshot';
import { Card, formatBytes } from '../primitives/Card';

interface CostTickerPanelProps {
  cost: DashboardCostSection;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}>
      <span style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export function CostTickerPanel({ cost }: CostTickerPanelProps) {
  if (!cost.hasAnyCostData) {
    return (
      <Card title="Cost Ticker">
        <p style={{ fontSize: 12, color: 'var(--dim)', margin: 0 }}>No cost data reported by provider for the latest iteration.</p>
      </Card>
    );
  }

  const execCost = cost.executionCostUsd !== null ? `$${cost.executionCostUsd.toFixed(4)}` : 'unavailable';
  const diagCost = cost.diagnosticCostUsd !== null ? `$${cost.diagnosticCostUsd.toFixed(4)}` : 'none';
  const cacheHit = cost.promptCacheStats === null
    ? 'unavailable'
    : cost.promptCacheStats.cacheHit === true ? 'hit'
    : cost.promptCacheStats.cacheHit === false ? 'miss'
    : 'unknown';
  const cachePrefix = cost.promptCacheStats !== null
    ? formatBytes(cost.promptCacheStats.staticPrefixBytes)
    : 'unavailable';

  return (
    <Card title="Cost Ticker">
      <div>
        <MetricRow label="Execution cost" value={execCost} />
        <MetricRow label="Diagnostic cost" value={diagCost} />
        <MetricRow label="Prompt cache" value={cacheHit} />
        <MetricRow label="Cache prefix" value={cachePrefix} />
      </div>
    </Card>
  );
}

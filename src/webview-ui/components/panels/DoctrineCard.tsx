import React from 'react';
import type { DashboardDoctrineSection, DashboardDoctrineDiagnostic } from '../../../webview/dashboardSnapshot';
import { Btn, Card, StatusPill } from '../primitives/Card';

interface DoctrineCardProps {
  doctrine: DashboardDoctrineSection | null;
  onCommand: (command: string) => void;
}

const HEALTH_KIND: Record<DashboardDoctrineSection['health'], 'ok' | 'warn' | 'bad'> = {
  healthy: 'ok',
  missing: 'bad',
  incomplete: 'warn',
  invalid_evidence_index: 'bad'
};

function healthLabel(health: DashboardDoctrineSection['health']): string {
  return health.replace(/_/g, ' ');
}

function DiagnosticList({ title, items }: { title: string; items: DashboardDoctrineDiagnostic[] }) {
  if (items.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.1, color: 'var(--dim)', fontWeight: 700 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }}>
        {items.map((item, index) => (
          <li key={`${item.code}-${item.file ?? 'workspace'}-${index}`} style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.45 }}>
            {item.file && <code style={{ color: 'var(--fg)' }}>{item.file}</code>} {item.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DoctrineCard({ doctrine, onCommand }: DoctrineCardProps) {
  if (!doctrine) return null;

  const diagnostics = doctrine.diagnostics;
  const diagnosticCount = diagnostics.missingFiles.length
    + diagnostics.missingHeadings.length
    + diagnostics.invalidEvidenceIndex.length
    + diagnostics.other.length;
  const reviewCommand = doctrine.actionTargets.reviewProposalsCommand;
  const hasPendingProposals = doctrine.pendingProposalCountsByRisk.total > 0;
  const effectiveReviewCommand = hasPendingProposals ? reviewCommand : null;

  return (
    <Card title="Doctrine" subtitle="Durable workspace rules, protected doctrine files, and prompt-context budget." accent>
      <div style={{ display: 'grid', gap: 12 }} data-testid="doctrine-card">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <StatusPill kind={HEALTH_KIND[doctrine.health]}>{healthLabel(doctrine.health)}</StatusPill>
          <StatusPill kind={doctrine.contextTruncated ? 'warn' : 'neutral'}>
            {doctrine.contextBudget.usedChars}/{doctrine.contextBudget.budgetChars} chars ({doctrine.contextBudget.usagePercent}%)
          </StatusPill>
          {doctrine.contextTruncated && <StatusPill kind="warn">context truncated</StatusPill>}
          {!doctrine.contextTruncated && <StatusPill kind="ok">within budget</StatusPill>}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.1, color: 'var(--dim)', fontWeight: 700 }}>Protected files</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {doctrine.protectedFiles.map((file) => (
              <button
                key={file}
                type="button"
                data-command={doctrine.actionTargets.openFileCommands[file]}
                onClick={() => onCommand(doctrine.actionTargets.openFileCommands[file])}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 8px', borderRadius: 999,
                  background: 'color-mix(in srgb, var(--warn) 8%, var(--surface-2))', color: 'var(--fg)',
                  border: '1px solid color-mix(in srgb, var(--warn) 30%, var(--border))', cursor: 'pointer'
                }}
              >
                {file} · protected
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {(['low', 'medium', 'high'] as const).map((risk) => (
            <div key={risk} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1 }}>{risk} proposals</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: risk === 'high' ? 'var(--bad)' : risk === 'medium' ? 'var(--warn)' : 'var(--fg)' }}>
                {doctrine.pendingProposalCountsByRisk[risk]}
              </div>
            </div>
          ))}
        </div>

        {diagnosticCount > 0 ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <DiagnosticList title="Missing files" items={diagnostics.missingFiles} />
            <DiagnosticList title="Missing headings" items={diagnostics.missingHeadings} />
            <DiagnosticList title="Invalid evidence index" items={diagnostics.invalidEvidenceIndex} />
            <DiagnosticList title="Other diagnostics" items={diagnostics.other} />
          </div>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--dim)', margin: 0 }}>Doctrine inspection found all required files, headings, and evidence-index shape.</p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span data-command={doctrine.actionTargets.initializeOrRepairCommand}>
            <Btn size="sm" variant={doctrine.health === 'healthy' ? 'secondary' : 'primary'} onClick={() => onCommand(doctrine.actionTargets.initializeOrRepairCommand)}>
            Initialize / Repair Doctrine Pack
            </Btn>
          </span>
          <span data-command={doctrine.actionTargets.openFolderCommand}>
            <Btn size="sm" variant="secondary" onClick={() => onCommand(doctrine.actionTargets.openFolderCommand)}>Open Doctrine Folder</Btn>
          </span>
          <span data-command={effectiveReviewCommand ?? ''}>
            <Btn size="sm" variant="secondary" onClick={() => effectiveReviewCommand && onCommand(effectiveReviewCommand)} disabled={!effectiveReviewCommand}>
              Review Latest Doctrine Proposal
            </Btn>
          </span>
        </div>
      </div>
    </Card>
  );
}

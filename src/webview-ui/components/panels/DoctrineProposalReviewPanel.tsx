import React, { useMemo, useState } from 'react';
import type {
  DashboardDoctrineProposalDetail,
  DashboardDoctrineProposalReviewSection
} from '../../../webview/dashboardSnapshot';
import type { RalphDoctrineProposalActionPayload, RalphWebviewMessage } from '../../../ui/uiTypes';
import { Btn, Card, StatusPill } from '../primitives/Card';

interface DoctrineProposalReviewPanelProps {
  review: DashboardDoctrineProposalReviewSection;
  onDoctrineAction: (action: RalphDoctrineProposalActionPayload) => void;
  lastActionResult?: Extract<RalphWebviewMessage, { type: 'doctrine-proposal-action-result' }> | null;
}

function riskKind(risk: string): 'ok' | 'warn' | 'bad' | 'neutral' {
  if (risk === 'high') return 'bad';
  if (risk === 'medium') return 'warn';
  if (risk === 'low') return 'ok';
  return 'neutral';
}

function selectedIndexes(detail: DashboardDoctrineProposalDetail | null, selections: Record<number, boolean>): number[] {
  if (!detail) return [];
  return detail.updates
    .filter((update) => selections[update.updateIndex] === true)
    .map((update) => update.updateIndex);
}

export function DoctrineProposalReviewPanel({ review, onDoctrineAction, lastActionResult = null }: DoctrineProposalReviewPanelProps) {
  const [selectedProposalId, setSelectedProposalId] = useState(review.proposals[0]?.proposalId ?? null);
  const [selectedUpdates, setSelectedUpdates] = useState<Record<number, boolean>>({});
  const selectedDetail = useMemo(() => (
    review.details.find((detail) => detail.proposalId === selectedProposalId) ?? review.details[0] ?? null
  ), [review.details, selectedProposalId]);

  if (!review.hasPendingProposals) {
    return (
      <Card title="Doctrine Proposal Review" subtitle="Operator-gated review for proposed doctrine mutations.">
        <p style={{ margin: 0, color: 'var(--dim)', fontSize: 12 }}>No pending doctrine proposals. New provider suggestions will appear here as review-only artifacts.</p>
      </Card>
    );
  }

  const checkedIndexes = selectedIndexes(selectedDetail, selectedUpdates);
  const hasProtectedSelection = selectedDetail
    ? selectedDetail.updates.some((update) => selectedUpdates[update.updateIndex] && update.requiresApproval)
    : false;
  const proposalHasProtectedTarget = selectedDetail?.updates.some((update) => update.requiresApproval) ?? false;

  const dispatch = (payload: RalphDoctrineProposalActionPayload) => onDoctrineAction(payload);

  return (
    <Card title="Doctrine Proposal Review" subtitle="Review, apply, partially apply, or reject persisted doctrine proposal artifacts." accent>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.75fr) minmax(320px, 1.25fr)', gap: 12 }} data-testid="doctrine-proposal-review">
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          {review.proposals.map((proposal) => {
            const active = proposal.proposalId === selectedDetail?.proposalId;
            return (
              <button
                key={proposal.proposalId}
                type="button"
                onClick={() => {
                  setSelectedProposalId(proposal.proposalId);
                  setSelectedUpdates({});
                }}
                style={{
                  textAlign: 'left',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'color-mix(in srgb, var(--accent) 10%, var(--surface-2))' : 'var(--surface-2)',
                  color: 'var(--fg)',
                  borderRadius: 8,
                  padding: 10,
                  fontFamily: 'inherit',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                  <strong style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{proposal.proposalId}</strong>
                  <StatusPill small kind={riskKind(proposal.risk)}>{proposal.risk}</StatusPill>
                  <StatusPill small kind={proposal.protectedTarget ? 'bad' : 'neutral'}>
                    {proposal.protectedTarget ? 'Protected target' : 'open target'}
                  </StatusPill>
                </div>
                <div style={{ fontSize: 11, color: 'var(--dim)', display: 'grid', gap: 3 }}>
                  <span>{proposal.source} · {proposal.status}</span>
                  <span>{proposal.targetFile}</span>
                  <span>{proposal.operation} · {proposal.updateCount} update(s)</span>
                  <span>{proposal.requiresApproval ? 'Explicit approval required' : 'Approval: normal operator action'}</span>
                </div>
              </button>
            );
          })}
        </div>

        {selectedDetail && (
          <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
            {lastActionResult && (
              <div style={{
                border: `1px solid ${lastActionResult.status === 'error' ? 'color-mix(in srgb, var(--bad) 45%, var(--border))' : 'var(--border)'}`,
                background: lastActionResult.status === 'error'
                  ? 'color-mix(in srgb, var(--bad) 10%, var(--surface))'
                  : 'var(--surface-2)',
                color: lastActionResult.status === 'error' ? 'var(--bad)' : 'var(--fg)',
                borderRadius: 8,
                padding: 10,
                fontSize: 12
              }}>
                Doctrine proposal action {lastActionResult.status}: {lastActionResult.message ?? `${lastActionResult.action} ${lastActionResult.proposalId}`}
              </div>
            )}
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <strong style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{selectedDetail.proposalId}</strong>
                <StatusPill small kind={riskKind(selectedDetail.risk)}>{selectedDetail.risk}</StatusPill>
                <StatusPill small>{selectedDetail.status}</StatusPill>
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)', display: 'grid', gap: 3 }}>
                <span>Source: {selectedDetail.source}</span>
                <span>Artifact: <code>{selectedDetail.path}</code></span>
                <span>Created: {selectedDetail.createdAt || 'unknown'}</span>
                <span>{selectedDetail.summary}</span>
              </div>
              {proposalHasProtectedTarget && (
                <div style={{
                  border: '1px solid color-mix(in srgb, var(--bad) 45%, var(--border))',
                  background: 'color-mix(in srgb, var(--bad) 10%, var(--surface))',
                  color: 'var(--fg)',
                  borderRadius: 7,
                  padding: 10,
                  fontSize: 12
                }}>
                  Protected target changes require explicit approval before RalphDex mutates invariants, boundaries, or agents doctrine.
                </div>
              )}
            </div>

            {selectedDetail.updates.map((update) => (
              <div key={update.updateIndex} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={selectedUpdates[update.updateIndex] === true}
                    onChange={(event) => setSelectedUpdates({
                      ...selectedUpdates,
                      [update.updateIndex]: event.currentTarget.checked
                    })}
                  />
                  Select update {update.updateIndex + 1} for partial apply
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <StatusPill small kind={riskKind(update.risk)}>{update.risk}</StatusPill>
                  <StatusPill small>{update.operation}</StatusPill>
                  {update.protectedTarget && <StatusPill small kind="bad">Protected target</StatusPill>}
                  {update.requiresApproval && <StatusPill small kind="bad">Explicit approval required</StatusPill>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--dim)', display: 'grid', gap: 3 }}>
                  <span>Target file: <code>{update.targetFile}</code></span>
                  <span>Section: {update.section ?? 'none'}</span>
                </div>
                <div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--dim)', fontWeight: 700, marginBottom: 4 }}>Proposed text</div>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, maxHeight: 240, overflow: 'auto', fontSize: 11, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>{update.proposedText.text}</pre>
                  {update.proposedText.truncated && <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 4 }}>Displayed text is truncated from {update.proposedText.fullLength} characters.</div>}
                </div>
                <div style={{ fontSize: 12 }}>
                  <strong>Rationale:</strong> {update.rationale.text}
                </div>
                <div style={{ fontSize: 12 }}>
                  <strong>Evidence:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {update.evidence.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <Btn size="sm" variant={proposalHasProtectedTarget ? 'danger' : 'primary'} onClick={() => dispatch({
                action: 'apply',
                proposalId: selectedDetail.proposalId,
                explicitProtectedApproval: proposalHasProtectedTarget
              })}>
                {proposalHasProtectedTarget ? 'Approve protected target and apply' : 'Apply'}
              </Btn>
              <Btn size="sm" variant="secondary" disabled={checkedIndexes.length === 0} onClick={() => dispatch({
                action: 'partialApply',
                proposalId: selectedDetail.proposalId,
                selectedUpdateIndexes: checkedIndexes,
                explicitProtectedApproval: hasProtectedSelection
              })}>
                {hasProtectedSelection ? 'Approve protected selection and partial apply' : 'Partial apply selected'}
              </Btn>
              <Btn size="sm" variant="danger" onClick={() => dispatch({ action: 'reject', proposalId: selectedDetail.proposalId })}>Reject</Btn>
              <Btn size="sm" variant="secondary" onClick={() => dispatch({ action: 'openTarget', proposalId: selectedDetail.proposalId })}>Open target file</Btn>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

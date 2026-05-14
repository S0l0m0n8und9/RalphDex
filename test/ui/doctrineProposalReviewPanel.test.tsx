import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildDoctrineProposalAction,
  DoctrineProposalReviewPanel
} from '../../src/webview-ui/components/panels/DoctrineProposalReviewPanel';
import type { DashboardDoctrineProposalReviewSection } from '../../src/webview/dashboardSnapshot';

function review(overrides: Partial<DashboardDoctrineProposalReviewSection> = {}): DashboardDoctrineProposalReviewSection {
  return {
    hasPendingProposals: true,
    proposals: [
      {
        proposalId: 'prop-append',
        path: '.ralph/artifacts/doctrine-proposals/prop-append.json',
        createdAt: '2026-05-01T00:00:00.000Z',
        source: 'completionReport',
        risk: 'low',
        status: 'proposed',
        targetFile: '.ralph/doctrine/workflows.md',
        operation: 'append',
        protectedTarget: false,
        requiresApproval: false,
        updateCount: 1
      },
      {
        proposalId: 'prop-protected',
        path: '.ralph/artifacts/doctrine-proposals/prop-protected.json',
        createdAt: '2026-05-02T00:00:00.000Z',
        source: 'completionReport',
        risk: 'high',
        status: 'proposed',
        targetFile: '.ralph/doctrine/invariants.md',
        operation: 'replaceSection',
        protectedTarget: true,
        requiresApproval: true,
        updateCount: 2
      }
    ],
    details: [
      {
        proposalId: 'prop-append',
        path: '.ralph/artifacts/doctrine-proposals/prop-append.json',
        createdAt: '2026-05-01T00:00:00.000Z',
        source: 'completionReport',
        risk: 'low',
        status: 'proposed',
        summary: 'Append workflow note.',
        warnings: [],
        updates: [{
          updateIndex: 0,
          targetFile: '.ralph/doctrine/workflows.md',
          operation: 'append',
          section: null,
          protectedTarget: false,
          requiresApproval: false,
          risk: 'low',
          proposedText: { text: '- Run npm run validate.', truncated: false, fullLength: 23 },
          rationale: { text: 'Observed validation command.', truncated: false, fullLength: 28 },
          evidence: ['package.json']
        }]
      },
      {
        proposalId: 'prop-protected',
        path: '.ralph/artifacts/doctrine-proposals/prop-protected.json',
        createdAt: '2026-05-02T00:00:00.000Z',
        source: 'completionReport',
        risk: 'high',
        status: 'proposed',
        summary: 'Protected invariant proposal.',
        warnings: [],
        updates: [
          {
            updateIndex: 0,
            targetFile: '.ralph/doctrine/invariants.md',
            operation: 'replaceSection',
            section: 'Core Invariants',
            protectedTarget: true,
            requiresApproval: true,
            risk: 'high',
            proposedText: { text: '- Protected invariant.', truncated: false, fullLength: 22 },
            rationale: { text: 'Core rule.', truncated: false, fullLength: 10 },
            evidence: ['src/invariants.ts']
          },
          {
            updateIndex: 1,
            targetFile: '.ralph/doctrine/workflows.md',
            operation: 'addSectionItem',
            section: 'Validate',
            protectedTarget: false,
            requiresApproval: false,
            risk: 'low',
            proposedText: { text: '- Validate command.', truncated: false, fullLength: 19 },
            rationale: { text: 'Workflow rule.', truncated: false, fullLength: 14 },
            evidence: ['package.json']
          }
        ]
      }
    ],
    ...overrides
  };
}

test('DoctrineProposalReviewPanel renders no-proposals state', () => {
  const html = renderToStaticMarkup(
    <DoctrineProposalReviewPanel review={review({ hasPendingProposals: false, proposals: [], details: [] })} onDoctrineAction={() => undefined} />
  );

  assert.ok(html.includes('No pending doctrine proposals'));
});

test('DoctrineProposalReviewPanel renders proposal list and append detail', () => {
  const html = renderToStaticMarkup(<DoctrineProposalReviewPanel review={review()} onDoctrineAction={() => undefined} />);

  assert.ok(html.includes('prop-append'));
  assert.ok(html.includes('.ralph/doctrine/workflows.md'));
  assert.ok(html.includes('append'));
  assert.ok(html.includes('Proposed text'));
  assert.ok(html.includes('- Run npm run validate.'));
  assert.ok(html.includes('Observed validation command.'));
  assert.ok(html.includes('package.json'));
});

test('DoctrineProposalReviewPanel renders replaceSection and addSectionItem details with protected approval copy', () => {
  const base = review();
  const protectedOnly = {
    ...base,
    proposals: base.proposals.slice(1),
    details: base.details.slice(1)
  };
  const html = renderToStaticMarkup(<DoctrineProposalReviewPanel review={protectedOnly} onDoctrineAction={() => undefined} />);

  assert.ok(html.includes('replaceSection'));
  assert.ok(html.includes('addSectionItem'));
  assert.ok(html.includes('Protected target'));
  assert.ok(html.includes('Explicit approval required'));
  assert.ok(html.includes('Approve protected target and apply'));
});

test('DoctrineProposalReviewPanel renders action failure feedback', () => {
  const html = renderToStaticMarkup(
    <DoctrineProposalReviewPanel
      review={review()}
      onDoctrineAction={() => undefined}
      lastActionResult={{
        type: 'doctrine-proposal-action-result',
        status: 'error',
        proposalId: 'prop-append',
        action: 'apply',
        message: 'Apply failed: malformed artifact.'
      }}
    />
  );

  assert.ok(html.includes('Doctrine proposal action error'));
  assert.ok(html.includes('Apply failed: malformed artifact.'));
});

test('DoctrineProposalReviewPanel action payload builder emits apply with proposal id', () => {
  assert.deepEqual(
    buildDoctrineProposalAction({ action: 'apply', proposalId: 'prop-append', explicitProtectedApproval: false }),
    { action: 'apply', proposalId: 'prop-append', explicitProtectedApproval: false }
  );
});

test('DoctrineProposalReviewPanel action payload builder emits partial apply indexes', () => {
  assert.deepEqual(
    buildDoctrineProposalAction({
      action: 'partialApply',
      proposalId: 'prop-protected',
      selectedUpdateIndexes: [0, 1],
      explicitProtectedApproval: true
    }),
    {
      action: 'partialApply',
      proposalId: 'prop-protected',
      selectedUpdateIndexes: [0, 1],
      explicitProtectedApproval: true
    }
  );
});

test('DoctrineProposalReviewPanel action payload builder carries explicit protected approval only when supplied', () => {
  assert.deepEqual(
    buildDoctrineProposalAction({
      action: 'apply',
      proposalId: 'prop-protected',
      explicitProtectedApproval: true
    }),
    {
      action: 'apply',
      proposalId: 'prop-protected',
      explicitProtectedApproval: true
    }
  );
  assert.deepEqual(
    buildDoctrineProposalAction({
      action: 'apply',
      proposalId: 'prop-append'
    }),
    {
      action: 'apply',
      proposalId: 'prop-append'
    }
  );
});

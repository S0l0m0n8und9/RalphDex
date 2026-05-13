import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DoctrineCard } from '../../src/webview-ui/components/panels/DoctrineCard';
import type { DashboardDoctrineSection } from '../../src/webview/dashboardSnapshot';

function doctrine(overrides: Partial<DashboardDoctrineSection> = {}): DashboardDoctrineSection {
  return {
    health: 'healthy',
    protectedFiles: ['invariants.md', 'boundaries.md', 'agents.md'],
    contextBudget: { usedChars: 4000, budgetChars: 8000, usagePercent: 50 },
    contextTruncated: false,
    diagnostics: { missingFiles: [], missingHeadings: [], invalidEvidenceIndex: [], other: [] },
    pendingProposalCountsByRisk: { low: 0, medium: 0, high: 0, total: 0 },
    actionTargets: {
      initializeOrRepairCommand: 'ralphCodex.initializeDoctrinePack',
      openFolderCommand: 'ralphCodex.openDoctrineFolder',
      openFileCommands: {
        'invariants.md': 'ralphCodex.openDoctrineInvariants',
        'boundaries.md': 'ralphCodex.openDoctrineBoundaries',
        'agents.md': 'ralphCodex.openDoctrineAgents'
      },
      reviewProposalsCommand: null,
      doctrineFolderPath: '.ralph/doctrine',
      latestProposalPath: null,
      latestProposalMarkdownPath: null
    },
    ...overrides
  };
}

test('DoctrineCard renders healthy state, protected files, and budget usage', () => {
  const html = renderToStaticMarkup(<DoctrineCard doctrine={doctrine()} onCommand={() => undefined} />);

  assert.ok(html.includes('healthy'));
  assert.ok(html.includes('invariants.md · protected'));
  assert.ok(html.includes('boundaries.md · protected'));
  assert.ok(html.includes('agents.md · protected'));
  assert.ok(html.includes('4000/8000 chars (50%)'));
});

test('DoctrineCard renders missing and incomplete diagnostics visibly', () => {
  const html = renderToStaticMarkup(<DoctrineCard doctrine={doctrine({
    health: 'incomplete',
    diagnostics: {
      missingFiles: [{ severity: 'warning', code: 'doctrine_required_file_missing', file: '.ralph/doctrine/risks.md', message: 'Missing risks.md.' }],
      missingHeadings: [{ severity: 'warning', code: 'doctrine_required_heading_missing', file: '.ralph/doctrine/agents.md', message: 'Missing ## Working Rules.' }],
      invalidEvidenceIndex: [],
      other: []
    }
  })} onCommand={() => undefined} />);

  assert.ok(html.includes('incomplete'));
  assert.ok(html.includes('Missing files'));
  assert.ok(html.includes('Missing risks.md.'));
  assert.ok(html.includes('Missing headings'));
  assert.ok(html.includes('Missing ## Working Rules.'));
});

test('DoctrineCard renders truncation and pending proposal counts', () => {
  const html = renderToStaticMarkup(<DoctrineCard doctrine={doctrine({
    contextTruncated: true,
    contextBudget: { usedChars: 8000, budgetChars: 8000, usagePercent: 100 },
    pendingProposalCountsByRisk: { low: 1, medium: 2, high: 3, total: 6 },
    actionTargets: {
      ...doctrine().actionTargets,
      reviewProposalsCommand: 'ralphCodex.openLatestDoctrineProposal'
    }
  })} onCommand={() => undefined} />);

  assert.ok(html.includes('context truncated'));
  assert.ok(html.includes('8000/8000 chars (100%)'));
  assert.ok(html.includes('low proposals'));
  assert.ok(html.includes('medium proposals'));
  assert.ok(html.includes('high proposals'));
  assert.ok(html.includes('>1<'));
  assert.ok(html.includes('>2<'));
  assert.ok(html.includes('>3<'));
});

test('DoctrineCard exposes command ids without remote assets', () => {
  const html = renderToStaticMarkup(<DoctrineCard doctrine={doctrine({
    actionTargets: {
      ...doctrine().actionTargets,
      reviewProposalsCommand: 'ralphCodex.openLatestDoctrineProposal'
    },
    pendingProposalCountsByRisk: { low: 1, medium: 0, high: 0, total: 1 }
  })} onCommand={() => undefined} />);

  assert.ok(html.includes('Initialize / Repair Doctrine Pack'));
  assert.ok(html.includes('Open Doctrine Folder'));
  assert.ok(html.includes('Review Doctrine Proposals'));
  assert.ok(html.includes('ralphCodex.initializeDoctrinePack'));
  assert.ok(html.includes('ralphCodex.openDoctrineFolder'));
  assert.ok(html.includes('ralphCodex.openDoctrineInvariants'));
  assert.ok(html.includes('ralphCodex.openDoctrineBoundaries'));
  assert.ok(html.includes('ralphCodex.openDoctrineAgents'));
  assert.ok(html.includes('ralphCodex.openLatestDoctrineProposal'));
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /cdn\./i);
});

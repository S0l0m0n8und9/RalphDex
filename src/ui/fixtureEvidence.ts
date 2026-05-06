import { createHash } from 'node:crypto';
import type { RalphDashboardState } from './uiTypes';
import { buildPanelDashboardHtml } from './panelHtml';
import { buildDashboardHtml } from './sidebarHtml';

export interface UiFixtureEvidenceInput {
  id: string;
  description: string;
  state: RalphDashboardState;
}

export interface UiFixtureEvidenceEntry {
  id: string;
  description: string;
  panelHash: string;
  sidebarHash: string;
  panelHtml: string;
  sidebarHtml: string;
}

export function renderUiFixtureEvidence(
  fixtures: ReadonlyArray<UiFixtureEvidenceInput>,
  nonce = 'fixture-evidence'
): UiFixtureEvidenceEntry[] {
  return [...fixtures]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((fixture) => {
      const panelHtml = buildPanelDashboardHtml(fixture.state, nonce);
      const sidebarHtml = buildDashboardHtml(fixture.state, nonce);
      return {
        id: fixture.id,
        description: fixture.description,
        panelHash: hashHtml(panelHtml),
        sidebarHash: hashHtml(sidebarHtml),
        panelHtml,
        sidebarHtml
      };
    });
}

function hashHtml(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}


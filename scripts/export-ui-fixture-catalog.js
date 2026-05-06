#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { renderUiFixtureEvidence } = require('../out/ui/fixtureEvidence.js');
const { UI_STATE_FIXTURES } = require('../out-test/test/ui/fixtures/uiStateFixtures.js');

async function main() {
  const outDirArg = process.argv.find((arg) => arg.startsWith('--outDir='));
  const outDir = outDirArg
    ? path.resolve(process.cwd(), outDirArg.slice('--outDir='.length))
    : path.resolve(process.cwd(), '.ralph', 'artifacts', 'ui-fixtures');

  const entries = renderUiFixtureEvidence(UI_STATE_FIXTURES, 'fixture-evidence');
  await fs.mkdir(outDir, { recursive: true });

  const manifest = {
    generatedAt: 'deterministic',
    fixtureCount: entries.length,
    entries: entries.map((entry) => ({
      id: entry.id,
      description: entry.description,
      panelHash: entry.panelHash,
      sidebarHash: entry.sidebarHash,
      panelPath: `panel-${entry.id}.html`,
      sidebarPath: `sidebar-${entry.id}.html`
    }))
  };

  await Promise.all([
    ...entries.map((entry) => fs.writeFile(path.join(outDir, `panel-${entry.id}.html`), entry.panelHtml, 'utf8')),
    ...entries.map((entry) => fs.writeFile(path.join(outDir, `sidebar-${entry.id}.html`), entry.sidebarHtml, 'utf8')),
    fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  ]);

  process.stdout.write(`UI fixture catalog exported to ${outDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});


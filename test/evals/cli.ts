import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { renderMarkdownSummary, runOfflineEvaluation } from './offlineEvalHarness';

function readArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  const next = process.argv[index + 1];
  return typeof next === 'string' && next.length > 0 ? next : null;
}

async function main(): Promise<void> {
  const fixturesDirectory = readArgValue('--fixtures-dir') ?? path.join(process.cwd(), 'test', 'evals', 'fixtures');
  const reportPath = readArgValue('--report-path');
  const report = await runOfflineEvaluation(fixturesDirectory);
  const markdown = renderMarkdownSummary(report);

  process.stdout.write(`${markdown}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (reportPath) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (report.expectationMismatches > 0) {
    process.exitCode = 1;
  }
}

void main();

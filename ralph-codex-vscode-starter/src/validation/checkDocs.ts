import { formatDocsValidationReport, validateRepositoryDocs } from './docsValidator';

async function main(): Promise<void> {
  const issues = await validateRepositoryDocs(process.cwd());
  const report = formatDocsValidationReport(issues);

  if (issues.length > 0) {
    console.error(report);
    process.exitCode = 1;
    return;
  }

  console.log(report);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`Documentation validation crashed.\n${message}`);
  process.exitCode = 1;
});

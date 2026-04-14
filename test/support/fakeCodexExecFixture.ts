import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const PIPELINE_SMOKE_PR_URL = 'https://github.com/acme/ralph-e2e-smoke/pull/1';

export async function writePipelineSmokeFakeCodexExecScript(rootPath: string): Promise<string> {
  const scriptPath = path.join(rootPath, 'exec');
  const script = `const fs = require('fs');
const path = require('path');

const PR_URL = ${JSON.stringify(PIPELINE_SMOKE_PR_URL)};
const OMIT_SCM_PR_URL = process.env.RALPH_E2E_PIPELINE_FAKE_SCM_NO_PR === '1';

function parseSelectedTaskId(prompt) {
  const match = prompt.match(/^- Selected task id: (.+)$/m);
  return match ? match[1].trim() : 'Tpipe-smoke';
}

function writeBuildChange(rootPath) {
  const fixturePath = path.join(rootPath, 'src', 'fixture.ts');
  const current = fs.readFileSync(fixturePath, 'utf8');
  if (!/pipelineSmoke\\s*=\\s*true/.test(current)) {
    const next = current.endsWith('\\n')
      ? current + 'export const pipelineSmoke = true;\\n'
      : current + '\\nexport const pipelineSmoke = true;\\n';
    fs.writeFileSync(fixturePath, next, 'utf8');
  }

  const progressPath = path.join(rootPath, '.ralph', 'progress.md');
  const note = '- Fake codex pipeline smoke completed the implementation slice.\\n';
  const existing = fs.existsSync(progressPath) ? fs.readFileSync(progressPath, 'utf8') : '# Progress\\n';
  if (!existing.includes(note.trim())) {
    const separator = existing.endsWith('\\n') ? '' : '\\n';
    fs.writeFileSync(progressPath, existing + separator + note, 'utf8');
  }
}

function buildMessage(report, summaryLines) {
  return [
    ...summaryLines,
    '',
    '\`\`\`json',
    JSON.stringify(report, null, 2),
    '\`\`\`'
  ].join('\\n');
}

let lastMessagePath = '';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output-last-message' && i + 1 < args.length) {
    lastMessagePath = args[++i];
  }
}

let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', () => {
  if (!prompt.includes('# Ralph Prompt:')) {
    process.stderr.write('Expected a Ralph prompt on stdin.\\n');
    process.exit(1);
    return;
  }

  const selectedTaskId = parseSelectedTaskId(prompt);
  let message;

  if (prompt.includes("You are Ralph's review agent.")) {
    message = buildMessage(
      {
        selectedTaskId,
        requestedStatus: 'in_progress',
        progressNote: 'Deterministic review fixture completed without follow-up findings.',
        validationRan: 'node -e "process.exit(0)"'
      },
      [
        'Validation results.',
        '- node -e "process.exit(0)" passed.',
        'Reviewed files or review scope.',
        '- src/fixture.ts',
        'Known limitations or follow-up work.',
        '- none'
      ]
    );
  } else if (prompt.includes('You are the Ralph SCM conflict-resolution agent.')) {
    message = buildMessage(
      {
        selectedTaskId,
        requestedStatus: 'done',
        progressNote: OMIT_SCM_PR_URL
          ? 'SCM fixture completed without emitting a PR URL.'
          : 'Opened PR at ' + PR_URL + '.'
      },
      [
        'Changed files.',
        '- none',
        'Validation results.',
        '- SCM fixture executed without live network access.',
        'Known limitations or follow-up work.',
        '- none'
      ]
    );
  } else {
    writeBuildChange(process.cwd());
    message = buildMessage(
      {
        selectedTaskId,
        requestedStatus: 'done',
        progressNote: 'Added pipelineSmoke export to src/fixture.ts.',
        validationRan: 'node -e "process.exit(0)"'
      },
      [
        'Changed files.',
        '- src/fixture.ts',
        '- .ralph/progress.md',
        'Validation results.',
        '- node -e "process.exit(0)" passed.',
        'Known limitations or follow-up work.',
        '- none'
      ]
    );
  }

  if (lastMessagePath) {
    fs.mkdirSync(path.dirname(lastMessagePath), { recursive: true });
    fs.writeFileSync(lastMessagePath, message + '\\n', 'utf8');
  }

  process.stdout.write(message + '\\n');
});
`;

  await fs.writeFile(scriptPath, script, 'utf8');
  return scriptPath;
}

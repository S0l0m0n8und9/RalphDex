import { runProcess } from './processRunner';

export interface CodexExecActivityInspection {
  check: 'clear' | 'active' | 'unavailable';
  summary: string;
  matchingProcesses: string[];
}

function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function inspectCodexExecActivity(rootPath: string): Promise<CodexExecActivityInspection> {
  try {
    const command = process.platform === 'win32' ? 'powershell' : 'sh';
    const args = process.platform === 'win32'
      ? [
        '-NoProfile',
        '-Command',
        [
          '$ErrorActionPreference = "Stop"',
          '$matches = Get-CimInstance Win32_Process',
          '| Where-Object { $_.CommandLine -and $_.CommandLine -match "(^|\\s)codex(\\.exe)?\\s+exec(\\s|$)" }',
          '| Select-Object -ExpandProperty CommandLine',
          'if ($matches) { $matches }'
        ].join(' ')
      ]
      : [
        '-lc',
        'ps -eo command | grep -E \'(^|[[:space:]])codex(\\.exe)?[[:space:]]+exec([[:space:]]|$)\' | grep -v grep || true'
      ];
    const result = await runProcess(command, args, {
      cwd: rootPath,
      shell: false
    });
    const matchingProcesses = normalizeLines(result.stdout);

    if (matchingProcesses.length > 0) {
      return {
        check: 'active',
        summary: `Detected ${matchingProcesses.length} running codex exec process${matchingProcesses.length === 1 ? '' : 'es'}.`,
        matchingProcesses
      };
    }

    return {
      check: 'clear',
      summary: 'No running codex exec process was detected.',
      matchingProcesses: []
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      check: 'unavailable',
      summary: `Could not inspect running codex exec processes: ${message}`,
      matchingProcesses: []
    };
  }
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { detectShellMismatchDiagnostic } from '../src/ralph/preflight';

test('flags a bash-style node -e command on win32', () => {
  const d = detectShellMismatchDiagnostic('node -e "JSON.parse(require(\'fs\').readFileSync(process.argv[1]))"', 'win32');
  assert.ok(d);
  assert.equal(d!.severity, 'warning');
  assert.equal(d!.code, 'validation_command_shell_mismatch');
});

test('does not flag a native pwsh command on win32', () => {
  const d = detectShellMismatchDiagnostic('pwsh -NoProfile -Command "$f=\'a.json\'; Get-Content $f"', 'win32');
  assert.equal(d, null);
});

test('does not flag a bash-style command on linux', () => {
  const d = detectShellMismatchDiagnostic('node -e "console.log(1)"', 'linux');
  assert.equal(d, null);
});

test('does not flag a plain npm command on win32', () => {
  const d = detectShellMismatchDiagnostic('npm run validate', 'win32');
  assert.equal(d, null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

test('activation smoke restores the original VS Code theme after exercising the theme matrix', () => {
  const suitePath = path.resolve(process.cwd(), 'test/vscode/suite/index.ts');
  const source = fs.readFileSync(suitePath, 'utf8');

  assert.match(source, /const\s+originalTheme\s*=\s*vscode\.workspace/);
  assert.match(source, /finally\s*\{[\s\S]*await\s+setColorTheme\(originalTheme\);[\s\S]*\}/);
});

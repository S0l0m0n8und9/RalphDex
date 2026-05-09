import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import test from 'node:test';

test('React webview bundle does not depend on a browser-global React variable', async () => {
  const bundlePath = path.join(__dirname, '..', '..', '..', 'out', 'webview-ui', 'main.js');
  const bundle = await fs.readFile(bundlePath, 'utf8');

  assert.ok(bundle.includes('createRoot'), 'webview bundle should include React DOM bootstrap code');
  assert.doesNotMatch(bundle, /\bReact\.createElement\b/);
});

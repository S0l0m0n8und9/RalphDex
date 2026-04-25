import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SHARED_WEBVIEW_CSS } from '../../src/webview/styles';

const sharedCssPath = path.resolve(__dirname, '../../../src/webview/styles/shared.css');
const sharedCssSource = fs.readFileSync(sharedCssPath, 'utf8');

const REQUIRED_SELECT_STYLE_PATTERNS = [
  /select\s*\{/,
  /--vscode-dropdown-background/,
  /--vscode-dropdown-foreground/,
  /select\s+option\s*\{/,
  /select\s+option:checked\s*\{/,
  /--vscode-list-activeSelectionBackground/,
  /--vscode-list-activeSelectionForeground/
] as const;

test('shared webview styles keep select open-state colors theme-driven in both source and runtime copies', () => {
  for (const pattern of REQUIRED_SELECT_STYLE_PATTERNS) {
    assert.match(sharedCssSource, pattern);
    assert.match(SHARED_WEBVIEW_CSS, pattern);
  }
});

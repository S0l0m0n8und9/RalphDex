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

type ThemeTokenFixture = {
  name: string;
  dropdownBackground: string;
  dropdownForeground: string;
  activeSelectionBackground: string;
  activeSelectionForeground: string;
};

const REPRESENTATIVE_THEME_FIXTURES: ThemeTokenFixture[] = [
  {
    name: 'default-light',
    dropdownBackground: '#ffffff',
    dropdownForeground: '#1f1f1f',
    activeSelectionBackground: '#cce8ff',
    activeSelectionForeground: '#000000'
  },
  {
    name: 'default-dark',
    dropdownBackground: '#3c3c3c',
    dropdownForeground: '#cccccc',
    activeSelectionBackground: '#094771',
    activeSelectionForeground: '#ffffff'
  },
  {
    name: 'high-contrast-dark',
    dropdownBackground: '#000000',
    dropdownForeground: '#ffffff',
    activeSelectionBackground: '#ffff00',
    activeSelectionForeground: '#000000'
  }
];

function parseHexColor(color: string): [number, number, number] {
  const normalized = color.trim();
  assert.match(normalized, /^#[0-9a-fA-F]{6}$/);
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16)
  ];
}

function toLinearSrgb(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = parseHexColor(color);
  return (0.2126 * toLinearSrgb(red)) + (0.7152 * toLinearSrgb(green)) + (0.0722 * toLinearSrgb(blue));
}

function contrastRatio(foreground: string, background: string): number {
  const fgLum = relativeLuminance(foreground);
  const bgLum = relativeLuminance(background);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

test('shared webview styles keep select open-state colors theme-driven in both source and runtime copies', () => {
  for (const pattern of REQUIRED_SELECT_STYLE_PATTERNS) {
    assert.match(sharedCssSource, pattern);
    assert.match(SHARED_WEBVIEW_CSS, pattern);
  }
});

test('representative VS Code light, dark, and high-contrast token pairs keep select open-state text legible', () => {
  const minimumContrastRatio = 4.5;

  for (const fixture of REPRESENTATIVE_THEME_FIXTURES) {
    const optionContrast = contrastRatio(fixture.dropdownForeground, fixture.dropdownBackground);
    const selectedOptionContrast = contrastRatio(fixture.activeSelectionForeground, fixture.activeSelectionBackground);

    assert.ok(
      optionContrast >= minimumContrastRatio,
      `${fixture.name}: option contrast ${optionContrast.toFixed(2)} is below ${minimumContrastRatio}`
    );
    assert.ok(
      selectedOptionContrast >= minimumContrastRatio,
      `${fixture.name}: selected option contrast ${selectedOptionContrast.toFixed(2)} is below ${minimumContrastRatio}`
    );
  }
});

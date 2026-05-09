import React, { useState } from 'react';
import type { SettingsSurfaceEntrySnapshot, SettingsSurfaceSectionSnapshot, SettingsSurfaceSnapshot } from '../../config/settingsSurface';
import { Btn } from './primitives/Card';

export interface SettingsPanelProps {
  settings: SettingsSurfaceSnapshot | null;
  onUpdate(key: string, value: unknown): void;
  onOpenVsCodeSettings(): void;
  onCommand: (command: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '';
  return String(value);
}

function findValue(settings: SettingsSurfaceSnapshot, key: string): unknown {
  for (const section of settings.sections) {
    for (const entry of section.entries) {
      if (entry.key === key) return entry.value;
    }
  }
  return undefined;
}

function providerTestLabel(provider: string): string {
  switch (provider) {
    case 'claude':           return 'Test Claude Connection';
    case 'copilot':          return 'Test GitHub Copilot Connection';
    case 'copilot-foundry':  return 'Test Copilot Foundry Connection';
    case 'azure-foundry':    return 'Test Azure AI Foundry Connection';
    case 'gemini':           return 'Test Gemini Connection';
    default:                 return 'Test Codex Connection';
  }
}

// ---------------------------------------------------------------------------
// NEW badge
// ---------------------------------------------------------------------------

function NewBadge() {
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 4,
      background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
      color: 'var(--accent)',
      border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginLeft: 6,
      verticalAlign: 'middle',
    }}>NEW</span>
  );
}

// ---------------------------------------------------------------------------
// Cross-validation
// ---------------------------------------------------------------------------

function crossValidate(
  entry: SettingsSurfaceEntrySnapshot,
  settings: SettingsSurfaceSnapshot
): string | null {
  const provider = String(findValue(settings, 'cliProvider') ?? '');

  if (entry.key === 'modelTiering.simpleThreshold' || entry.key === 'modelTiering.complexThreshold') {
    const simple = Number(findValue(settings, 'modelTiering.simpleThreshold') ?? 0);
    const complex = Number(findValue(settings, 'modelTiering.complexThreshold') ?? 0);
    if (simple >= complex) {
      return 'Simple threshold must be strictly less than complex threshold.';
    }
  }

  if (entry.key === 'azureFoundry.endpointUrl') {
    if (provider === 'azure-foundry' && !stringValue(entry.value)) {
      return 'Endpoint URL is required when azure-foundry is the active provider.';
    }
  }

  if (entry.key === 'azureFoundry.auth.secretStorageKey') {
    const authMode = String(findValue(settings, 'azureFoundry.auth.mode') ?? '');
    if (provider === 'azure-foundry' && authMode === 'vscode-secret' && !stringValue(entry.value)) {
      return 'SecretStorage key is required when auth mode is vscode-secret. Use Set Secret to store credentials.';
    }
  }

  if (entry.key === 'azureFoundry.auth.apiKeyEnvVar') {
    const authMode = String(findValue(settings, 'azureFoundry.auth.mode') ?? '');
    if (provider === 'azure-foundry' && authMode === 'env-api-key' && !stringValue(entry.value)) {
      return 'API key environment variable is required when auth mode is env-api-key.';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Setting control
// ---------------------------------------------------------------------------

function SettingControl({
  entry,
  onUpdate,
}: {
  entry: SettingsSurfaceEntrySnapshot;
  onUpdate(key: string, value: unknown): void;
}) {
  const inputStyle: React.CSSProperties = {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--fg)',
    fontFamily: 'inherit',
    fontSize: 12,
    padding: '4px 8px',
    minWidth: 0,
    width: '100%',
    boxSizing: 'border-box',
  };

  if (entry.control === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(entry.value)}
        data-setting={entry.key}
        onChange={(e) => onUpdate(entry.key, e.currentTarget.checked)}
        style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
      />
    );
  }

  if (entry.control === 'enum' && entry.options?.length) {
    return (
      <select
        value={stringValue(entry.value)}
        data-setting={entry.key}
        onChange={(e) => onUpdate(entry.key, e.currentTarget.value)}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        {entry.options.map((opt) => (
          <option key={opt} value={opt}>{opt === '' ? '(empty)' : opt}</option>
        ))}
      </select>
    );
  }

  if (entry.control === 'number') {
    return (
      <input
        type="number"
        value={stringValue(entry.value)}
        data-setting={entry.key}
        onChange={(e) => {
          const parsed = Number(e.currentTarget.value);
          onUpdate(entry.key, Number.isFinite(parsed) ? parsed : entry.value);
        }}
        style={inputStyle}
      />
    );
  }

  if (entry.control === 'suggested-string') {
    const datalistId = `datalist-${entry.key.replace(/\./g, '-')}`;
    return (
      <>
        <input
          type="text"
          list={datalistId}
          value={stringValue(entry.value)}
          data-setting={entry.key}
          onChange={(e) => onUpdate(entry.key, e.currentTarget.value)}
          style={inputStyle}
        />
        {entry.options && entry.options.length > 0 && (
          <datalist id={datalistId}>
            {entry.options.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        )}
      </>
    );
  }

  if (entry.control === 'string-array') {
    const currentArray: string[] = Array.isArray(entry.value) ? (entry.value as string[]) : [];
    if (entry.options && entry.options.length > 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entry.options.map((opt) => {
            const checked = currentArray.includes(opt);
            return (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.currentTarget.checked
                      ? [...currentArray, opt]
                      : currentArray.filter((v) => v !== opt);
                    onUpdate(entry.key, next);
                  }}
                  style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span style={{ color: 'var(--fg)' }}>{opt}</span>
              </label>
            );
          })}
        </div>
      );
    }
    // No predefined options — fall through to text input
    return (
      <input
        type="text"
        value={currentArray.join(', ')}
        data-setting={entry.key}
        placeholder="Comma-separated values"
        onChange={(e) => {
          const next = e.currentTarget.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          onUpdate(entry.key, next);
        }}
        style={inputStyle}
      />
    );
  }

  // 'string' default
  return (
    <input
      type="text"
      value={stringValue(entry.value)}
      data-setting={entry.key}
      onChange={(e) => onUpdate(entry.key, e.currentTarget.value)}
      style={inputStyle}
    />
  );
}

// ---------------------------------------------------------------------------
// Setting entry row
// ---------------------------------------------------------------------------

function SettingEntry({
  entry,
  onUpdate,
  settings,
}: {
  entry: SettingsSurfaceEntrySnapshot;
  onUpdate(key: string, value: unknown): void;
  settings: SettingsSurfaceSnapshot;
}) {
  const error = crossValidate(entry, settings);
  const isCheckbox = entry.control === 'boolean';

  return (
    <div style={{ display: 'grid', gap: 4, padding: '10px 0', borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)' }}>
      {/* Label row */}
      <div style={{ display: 'flex', alignItems: isCheckbox ? 'center' : 'flex-start', flexDirection: isCheckbox ? 'row' : 'column', gap: isCheckbox ? 8 : 4 }}>
        {isCheckbox ? (
          <>
            <SettingControl entry={entry} onUpdate={onUpdate} />
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>
              {entry.title}
              {entry.isNew && <NewBadge />}
            </span>
          </>
        ) : (
          <>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', display: 'block' }}>
              {entry.title}
              {entry.isNew && <NewBadge />}
            </label>
            <SettingControl entry={entry} onUpdate={onUpdate} />
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 11, color: 'var(--bad)', marginTop: 2 }}>{error}</div>
      )}

      {/* Description */}
      {entry.description && (
        <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>{entry.description}</div>
      )}

      {/* Default value */}
      {entry.defaultValue !== undefined && entry.defaultValue !== null && (
        <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
          Default: {Array.isArray(entry.defaultValue) ? (entry.defaultValue as unknown[]).join(', ') || '(empty)' : String(entry.defaultValue)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

function SectionBlock({
  section,
  isFirst,
  provider,
  onUpdate,
  onCommand,
  settings,
}: {
  section: SettingsSurfaceSectionSnapshot;
  isFirst: boolean;
  provider: string;
  onUpdate(key: string, value: unknown): void;
  onCommand(command: string): void;
  settings: SettingsSurfaceSnapshot;
}) {
  return (
    <details open={isFirst} style={{ marginBottom: 2 }}>
      <summary style={{
        cursor: 'pointer',
        padding: '10px 14px',
        borderRadius: 6,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--fg)',
        listStyle: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        userSelect: 'none',
      }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}
      >
        <span style={{ flex: 1 }}>
          {section.title}
          {section.hasNewSettings && <NewBadge />}
        </span>
        <span style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>▾</span>
      </summary>

      <div style={{ padding: '0 4px 8px 4px' }}>
        {/* Provider section action buttons */}
        {section.id === 'provider' && (
          <div style={{ display: 'flex', gap: 8, padding: '12px 0 4px 0', flexWrap: 'wrap' }}>
            <Btn size="sm" variant="primary" onClick={() => onCommand('ralphCodex.testCurrentProviderConnection')}>
              {providerTestLabel(provider)}
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => onCommand('ralphCodex.setProviderSecret')}>
              Set Secret
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => onCommand('ralphCodex.clearProviderSecret')}>
              Clear Secret
            </Btn>
          </div>
        )}

        {section.entries.map((entry) => (
          <SettingEntry key={entry.key} entry={entry} onUpdate={onUpdate} settings={settings} />
        ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Active Execution Profile block
// ---------------------------------------------------------------------------

function ExecutionProfile({ settings }: { settings: SettingsSurfaceSnapshot }) {
  const provider = String(findValue(settings, 'cliProvider') ?? 'codex');
  const model = String(findValue(settings, 'model') ?? '') || 'unset';
  const reasoning = String(findValue(settings, 'reasoningEffort') ?? '') || 'unset';

  const tieringEnabled = Boolean(findValue(settings, 'modelTiering.enabled'));
  let tieringLabel: string;
  if (tieringEnabled) {
    const simple = String(findValue(settings, 'modelTiering.simple.model') ?? '') || '?';
    const medium = String(findValue(settings, 'modelTiering.medium.model') ?? '') || '?';
    const complex = String(findValue(settings, 'modelTiering.complex.model') ?? '') || '?';
    tieringLabel = `${simple} / ${medium} / ${complex}`;
  } else {
    tieringLabel = 'disabled';
  }

  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12 }}>
      <span style={{ color: 'var(--dim)', width: 76, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>{value}</span>
    </div>
  );

  return (
    <div style={{
      background: 'color-mix(in srgb, var(--accent) 6%, var(--surface))',
      border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--border))',
      borderLeft: '3px solid var(--accent)',
      borderRadius: 8,
      padding: '12px 16px',
      marginBottom: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }}>
        Active Execution Profile
      </div>
      {row('Provider', provider)}
      {row('Model', model)}
      {row('Reasoning', reasoning)}
      {row('Tiering', tieringLabel)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function SettingsPanel({ settings, onUpdate, onOpenVsCodeSettings, onCommand }: SettingsPanelProps) {
  if (!settings) {
    return (
      <section style={{ padding: '24px 0' }} aria-labelledby="settings-title">
        <h2 id="settings-title" style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Settings</h2>
        <p style={{ color: 'var(--dim)', fontSize: 13 }}>Settings are unavailable until a workspace is active.</p>
        <Btn size="sm" variant="secondary" onClick={onOpenVsCodeSettings} style={{ marginTop: 12 }}>
          Open in VS Code Settings
        </Btn>
      </section>
    );
  }

  const provider = String(findValue(settings, 'cliProvider') ?? '');

  // Filter sections by provider visibility
  const visibleSections = settings.sections.filter((section) => {
    if (section.id === 'copilot-foundry') {
      return provider === 'copilot-byok' || provider === 'copilot-foundry';
    }
    if (section.id === 'azure-foundry') {
      return provider === 'azure-foundry';
    }
    return true;
  });

  const normalSections = visibleSections.filter((s) => s.id !== 'advanced');
  const advancedSections = visibleSections.filter((s) => s.id === 'advanced');

  // First non-advanced section gets open by default
  const firstNormalId = normalSections[0]?.id;

  return (
    <section aria-labelledby="settings-title">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 id="settings-title" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Settings</h2>
        <Btn size="sm" variant="ghost" onClick={onOpenVsCodeSettings}>
          Open in VS Code ↗
        </Btn>
      </div>

      {/* Active Execution Profile */}
      <ExecutionProfile settings={settings} />

      {/* Normal sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {normalSections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            isFirst={section.id === firstNormalId}
            provider={provider}
            onUpdate={onUpdate}
            onCommand={onCommand}
            settings={settings}
          />
        ))}
      </div>

      {/* Advanced sections — collapsed wrapper */}
      {advancedSections.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{
            cursor: 'pointer',
            padding: '10px 14px',
            borderRadius: 6,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--dim)',
            listStyle: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            userSelect: 'none',
          }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}
          >
            <span style={{ flex: 1 }}>Advanced Configuration</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>▾</span>
          </summary>
          <div style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {advancedSections.map((section) => (
              <SectionBlock
                key={section.id}
                section={section}
                isFirst={false}
                provider={provider}
                onUpdate={onUpdate}
                onCommand={onCommand}
                settings={settings}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

import type { SettingsSurfaceEntrySnapshot, SettingsSurfaceSnapshot } from '../../config/settingsSurface';

interface SettingsPanelProps {
  settings: SettingsSurfaceSnapshot | null;
  onUpdate(key: string, value: unknown): void;
}

function stringValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function parseValue(entry: SettingsSurfaceEntrySnapshot, value: string | boolean): unknown {
  if (entry.control === 'boolean') {
    return Boolean(value);
  }
  if (entry.control === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : entry.value;
  }
  if (entry.control === 'string-array') {
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return String(value);
}

function SettingControl({ entry, onUpdate }: { entry: SettingsSurfaceEntrySnapshot; onUpdate(key: string, value: unknown): void }) {
  if (entry.control === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(entry.value)}
        data-setting={entry.key}
        onChange={(event) => onUpdate(entry.key, parseValue(entry, event.currentTarget.checked))}
      />
    );
  }

  if (entry.control === 'enum' && entry.options?.length) {
    return (
      <select
        value={stringValue(entry.value)}
        data-setting={entry.key}
        onChange={(event) => onUpdate(entry.key, parseValue(entry, event.currentTarget.value))}
      >
        {entry.options.map((option) => (
          <option key={option} value={option}>{option || '(empty)'}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={entry.control === 'number' ? 'number' : 'text'}
      value={stringValue(entry.value)}
      data-setting={entry.key}
      onChange={(event) => onUpdate(entry.key, parseValue(entry, event.currentTarget.value))}
    />
  );
}

export function SettingsPanel({ settings, onUpdate }: SettingsPanelProps) {
  if (!settings) {
    return (
      <section className="rdx-section" aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>
        <p>Settings are unavailable until a workspace is active.</p>
      </section>
    );
  }

  return (
    <section className="rdx-section settings" aria-labelledby="settings-title">
      <div className="rdx-section-header">
        <h2 id="settings-title">Settings</h2>
      </div>
      {settings.sections.slice(0, 4).map((section) => (
        <details key={section.id} open={section.hasNewSettings}>
          <summary>{section.title}</summary>
          <div className="rdx-settings-grid">
            {section.entries.slice(0, 8).map((entry) => (
              <label key={entry.key} className="rdx-setting">
                <span>{entry.title}</span>
                <SettingControl entry={entry} onUpdate={onUpdate} />
              </label>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}

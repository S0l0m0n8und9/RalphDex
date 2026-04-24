import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { RalphCodexConfig } from '../src/config/types';

type ContributedSetting = {
  default?: unknown;
};

type PackageManifest = {
  contributes?: {
    configuration?: {
      properties?: Record<string, ContributedSetting>;
    };
  };
};

const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');

const MANIFEST_DEFAULT_EXEMPTIONS: Record<string, string> = {
  // Convenience alias for modelTiering.enabled. Runtime only applies this
  // when the user explicitly sets workspace/global values via inspect().
  'ralphCodex.enableModelTiering':
    'No direct RalphCodexConfig field; readConfig treats this as an explicit override signal only.'
};

async function readPackageManifest(): Promise<PackageManifest> {
  const raw = await fs.readFile(packageJsonPath, 'utf8');
  return JSON.parse(raw) as PackageManifest;
}

test('contributed ralphCodex defaults stay in sync with DEFAULT_CONFIG', async () => {
  const manifest = await readPackageManifest();
  const properties = manifest.contributes?.configuration?.properties ?? {};
  const runtimeDefaults = DEFAULT_CONFIG as Record<keyof RalphCodexConfig, unknown>;

  for (const [runtimeKey, runtimeValue] of Object.entries(runtimeDefaults) as Array<[keyof RalphCodexConfig, unknown]>) {
    const manifestKey = `ralphCodex.${runtimeKey}`;
    const setting = properties[manifestKey];
    assert.ok(setting, `Missing contributed setting for ${manifestKey}`);
    assert.ok(Object.hasOwn(setting, 'default'), `Missing contributed default for ${manifestKey}`);
    assert.deepEqual(setting.default, runtimeValue, `Default mismatch for ${manifestKey}`);
  }

  for (const [manifestKey, setting] of Object.entries(properties)) {
    if (!manifestKey.startsWith('ralphCodex.')) {
      continue;
    }

    if (!Object.hasOwn(setting, 'default')) {
      continue;
    }

    const runtimeKey = manifestKey.slice('ralphCodex.'.length);
    if (Object.hasOwn(runtimeDefaults, runtimeKey)) {
      continue;
    }

    assert.ok(
      Object.hasOwn(MANIFEST_DEFAULT_EXEMPTIONS, manifestKey),
      `Contributed default ${manifestKey} is not represented in DEFAULT_CONFIG; add a documented exemption if intentional.`
    );
  }
});

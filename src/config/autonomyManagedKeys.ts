// Single source of truth for settings whose effective value readConfig
// force-derives when autonomyMode is 'autonomous' (see readConfig's
// effectiveAutonomy block). Editing these directly while autonomous has no
// effect — the resolved value is overridden — so the Settings panel disables
// and annotates them.
//
// This module must stay free of `vscode` and Node imports so the webview bundle
// can import it. settingsAutonomyOverride.test.ts locks each listed key to an
// actual readConfig override, so removing an override here without updating
// readConfig (or vice versa) fails the suite.
export const AUTONOMY_MANAGED_KEYS = ['autoReplenishBacklog', 'autoApplyRemediation'] as const;

export type AutonomyManagedKey = (typeof AUTONOMY_MANAGED_KEYS)[number];

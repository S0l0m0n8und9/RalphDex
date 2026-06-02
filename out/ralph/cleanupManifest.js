"use strict";
/**
 * Cleanup manifest (issue #72).
 *
 * "Clean Up Old Run Artifacts" is a destructive operation against the artifact
 * store that operators are asked to trust as provenance evidence. This module
 * defines a durable, machine-readable manifest that makes a cleanup explainable
 * *before* it runs (a dry-run preview) and auditable *after* it runs (the
 * applied manifest): exactly which artifacts were/would be deleted, retained,
 * and protected, which latest-pointer surfaces were repaired, and whether the
 * canonical artifact registry (#69) was consistent.
 *
 * The manifest carries plain string lists so it stays decoupled from the
 * retention-summary shapes in `artifactRetention.ts`; the state manager maps the
 * retention results into it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLEANUP_MANIFEST_SCHEMA_VERSION = void 0;
exports.totalDeletedCount = totalDeletedCount;
exports.renderCleanupManifestMarkdown = renderCleanupManifestMarkdown;
exports.CLEANUP_MANIFEST_SCHEMA_VERSION = 1;
/** Total count of artifacts deleted/slated across every category. */
function totalDeletedCount(manifest) {
    return (manifest.deleted.iterationDirectories.length
        + manifest.deleted.promptFiles.length
        + manifest.deleted.runArtifactBaseNames.length
        + manifest.deleted.handoffFiles.length
        + manifest.deleted.watchdogFiles.length
        + manifest.provenanceBundles.deletedBundleIds.length
        + manifest.deletedLogFiles.length);
}
function renderList(label, items) {
    if (items.length === 0) {
        return [`- ${label}: none`];
    }
    return [`- ${label} (${items.length}):`, ...items.map((item) => `  - ${item}`)];
}
/** Renders a human-readable summary of the manifest for operator review. */
function renderCleanupManifestMarkdown(manifest) {
    const verb = manifest.mode === 'preview' ? 'Would delete' : 'Deleted';
    const lines = [
        `# Ralph cleanup manifest (${manifest.mode})`,
        '',
        `- Created: ${manifest.createdAt}`,
        `- Retention count: ${manifest.retentionCount}`,
        `- Total ${manifest.mode === 'preview' ? 'to delete' : 'deleted'}: ${totalDeletedCount(manifest)}`,
        `- Artifact registry: ${manifest.registryStatus}`
            + (manifest.mode === 'applied' ? ` (reconciled ${manifest.registryReconciledEntryCount} stale entr${manifest.registryReconciledEntryCount === 1 ? 'y' : 'ies'})` : ''),
        '',
        '## Generated artifacts',
        ...renderList(`${verb} iteration directories`, manifest.deleted.iterationDirectories),
        ...renderList(`${verb} prompt files`, manifest.deleted.promptFiles),
        ...renderList(`${verb} run artifact sets`, manifest.deleted.runArtifactBaseNames),
        ...renderList(`${verb} handoff files`, manifest.deleted.handoffFiles),
        ...renderList(`${verb} watchdog files`, manifest.deleted.watchdogFiles),
        '',
        '## Provenance bundles',
        ...renderList(`${verb} bundles`, manifest.provenanceBundles.deletedBundleIds),
        ...renderList('Retained bundles', manifest.provenanceBundles.retainedBundleIds),
        ...renderList('Protected bundles', manifest.provenanceBundles.protectedBundleIds),
        '',
        '## Logs',
        ...renderList(`${verb} log files`, manifest.deletedLogFiles),
        '',
        '## Latest-pointer integrity',
        ...renderList('Repaired pointers', manifest.pointerIntegrity.repairedLatestArtifactPaths),
        ...renderList('Stale pointers (could not repair)', manifest.pointerIntegrity.staleLatestArtifactPaths)
    ];
    return lines.join('\n');
}
//# sourceMappingURL=cleanupManifest.js.map
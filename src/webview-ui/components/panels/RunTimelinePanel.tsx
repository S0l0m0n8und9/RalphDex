import React from 'react';
import type { DashboardRunTimelineSection } from '../../../webview/dashboardSnapshot';
import { Card } from '../primitives/Card';

interface RunTimelinePanelProps {
  runTimeline: DashboardRunTimelineSection;
}

function Pill({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 4,
      background: 'var(--surface-2)', color: 'var(--dim)', border: '1px solid var(--border)'
    }}>{label}</span>
  );
}

/**
 * Operator trust timeline (issue #73): a pre-run intent preview (what Ralph may
 * change) and a post-run mutation timeline + auto-remediation audit, projected
 * from the latest run's event journal. Read-only.
 */
export function RunTimelinePanel({ runTimeline }: RunTimelinePanelProps) {
  const { intent, entries, remediationAudit, totals, stopReason, runId } = runTimeline;
  const fileChanges = runTimeline.fileChanges ?? {
    status: 'missing' as const,
    artifactPath: null,
    changedFileCount: 0,
    relevantChangedFileCount: 0,
    files: [],
    message: 'No durable diff summary was recorded for the latest run.'
  };
  const hiddenFileCount = Math.max(0, fileChanges.changedFileCount - fileChanges.files.length);
  return (
    <Card title="Run Trust Timeline" subtitle="Execution intent + what the latest run changed">
      <div style={{ display: 'grid', gap: 12 }}>
        {intent && (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Pill label={`provider: ${intent.provider}`} />
              <Pill label={`autonomy: ${intent.autonomyMode}`} />
              <Pill label={`scm: ${intent.scmStrategy}`} />
              <Pill label={`verifiers: ${intent.verifierStack.join(', ') || 'none'}`} />
              {intent.autoAppliedRemediations.length > 0 && <Pill label={`auto-remediation: ${intent.autoAppliedRemediations.join(', ')}`} />}
            </div>
            <div style={{ display: 'grid', gap: 2 }}>
              {intent.notes.map((note) => (
                <div key={note} style={{ fontSize: 11, color: 'var(--dim)' }}>{note}</div>
              ))}
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--dim)' }}>
          {runId
            ? `Latest run ${runId}${stopReason ? ` · stop: ${stopReason}` : ''} · ${totals.taskStateChanges} task changes, ${totals.remediationsApplied} remediations applied, ${totals.scmActions} SCM actions, ${totals.artifactsWritten} artifacts`
            : 'No run has been recorded yet.'}
        </div>

        {runId && (
          <div style={{ display: 'grid', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 600 }}>Repository file changes</span>
              <Pill label={fileChanges.status} />
              <Pill label={`${fileChanges.relevantChangedFileCount}/${fileChanges.changedFileCount} relevant`} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>{fileChanges.message}</div>
            {fileChanges.files.length > 0 && (
              <div style={{ display: 'grid', gap: 3 }}>
                {fileChanges.files.map((file) => (
                  <div key={file.path} style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr) auto', gap: 8, alignItems: 'baseline', fontSize: 11 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--dim)' }}>{file.changeType}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg)', overflowWrap: 'anywhere' }}>{file.path}</span>
                    <span style={{ color: file.relevant ? 'var(--ok)' : 'var(--dim)' }}>{file.relevant ? 'relevant' : 'managed'}</span>
                  </div>
                ))}
                {hiddenFileCount > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--dim)' }}>+{hiddenFileCount} more file{hiddenFileCount === 1 ? '' : 's'}</div>
                )}
              </div>
            )}
          </div>
        )}

        {entries.length > 0 && (
          <div style={{ display: 'grid', gap: 4 }}>
            {entries.map((entry) => (
              <div key={entry.seq} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11, padding: '3px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--dim)', flexShrink: 0 }}>{entry.kind}</span>
                <span style={{ color: 'var(--fg)' }}>{entry.summary}</span>
              </div>
            ))}
          </div>
        )}

        {remediationAudit.length > 0 && (
          <div style={{ display: 'grid', gap: 2 }}>
            <div style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 600 }}>Auto-remediation audit</div>
            {remediationAudit.map((audit) => (
              <div key={audit.seq} style={{ fontSize: 11, color: audit.applied ? 'var(--warn)' : 'var(--dim)' }}>
                {audit.action} on {audit.taskId ?? 'unknown'}: {audit.applied ? 'applied' : 'proposed (not applied)'}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

import type {
  RalphAutonomyMode,
  RalphCodexConfig,
  RalphGitCheckpointMode,
  RalphScmStrategy,
  RalphVerifierMode,
  AutoApplyRemediationAction
} from '../config/types';
import type { RalphAgentRole, RalphDiffSummary, RalphStopReason } from './types';
import type { RalphRuntimeEvent } from './eventJournal';

/**
 * Operator trust timeline (issue #73).
 *
 * Two operator-facing views, both derived from durable state so they require no
 * hidden runtime memory:
 *
 * - {@link buildExecutionIntentPreview} — a *pre-run* preview of what Ralph may
 *   do (provider, autonomy mode, verifier stack, SCM mode, possible task
 *   mutations) so the operator can see intent before an autonomous/full-workflow
 *   run starts.
 * - {@link buildRunTrustTimeline} — a *post-run* projection over the typed event
 *   journal (#68) into a chronological mutation timeline plus an auto-remediation
 *   audit trail and the stop reason, so the operator can explain what a run
 *   actually changed.
 *
 * Both are pure: they never touch disk. The dashboard data layer reads the
 * latest run's event journal and passes the events here.
 */

// ---------------------------------------------------------------------------
// Pre-run execution intent preview
// ---------------------------------------------------------------------------

export interface ExecutionIntentPreview {
  provider: string;
  autonomyMode: RalphAutonomyMode;
  agentRole: RalphAgentRole;
  verifierStack: RalphVerifierMode[];
  gitCheckpointMode: RalphGitCheckpointMode;
  scmStrategy: RalphScmStrategy;
  /** Remediation actions Ralph may auto-apply this run (from `autoApplyRemediation`). */
  autoAppliedRemediations: AutoApplyRemediationAction[];
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  /** Plain-English notes describing what Ralph may change. */
  notes: string[];
}

export type ExecutionIntentConfig = Pick<
  RalphCodexConfig,
  'cliProvider' | 'autonomyMode' | 'agentRole' | 'verifierModes' | 'gitCheckpointMode' | 'scmStrategy' | 'autoApplyRemediation'
>;

/** Builds a pre-run intent preview from the effective config and selected task. */
export function buildExecutionIntentPreview(input: {
  config: ExecutionIntentConfig;
  selectedTask?: { id: string; title: string } | null;
}): ExecutionIntentPreview {
  const { config } = input;
  const selectedTask = input.selectedTask ?? null;
  const notes: string[] = [];

  notes.push(`Provider: ${config.cliProvider} (${config.autonomyMode} autonomy, role ${config.agentRole}).`);
  notes.push(
    config.verifierModes.length > 0
      ? `Verifier stack: ${config.verifierModes.join(', ')}.`
      : 'Verifier stack: none configured.'
  );
  notes.push(`Git checkpoint: ${config.gitCheckpointMode}; SCM: ${config.scmStrategy}.`);
  if (config.scmStrategy !== 'none') {
    notes.push(
      config.scmStrategy === 'branch-per-task'
        ? 'May create a branch per task and open a PR on completion.'
        : 'May commit on task completion.'
    );
  }
  if (config.autoApplyRemediation.length > 0) {
    notes.push(`May auto-apply remediation: ${config.autoApplyRemediation.join(', ')}.`);
  } else {
    notes.push('Will not auto-apply task remediation (proposals only).');
  }
  notes.push(
    selectedTask
      ? `Selected task: ${selectedTask.id} — ${selectedTask.title}.`
      : 'No task selected yet; the next actionable task will be chosen at run time.'
  );

  return {
    provider: config.cliProvider,
    autonomyMode: config.autonomyMode,
    agentRole: config.agentRole,
    verifierStack: [...config.verifierModes],
    gitCheckpointMode: config.gitCheckpointMode,
    scmStrategy: config.scmStrategy,
    autoAppliedRemediations: [...config.autoApplyRemediation],
    selectedTaskId: selectedTask?.id ?? null,
    selectedTaskTitle: selectedTask?.title ?? null,
    notes
  };
}

// ---------------------------------------------------------------------------
// Post-run trust timeline (projection over the event journal)
// ---------------------------------------------------------------------------

export type TrustTimelineEntryKind =
  | 'run_started'
  | 'task_selected'
  | 'task_state_changed'
  | 'provider_completed'
  | 'verifier_result'
  | 'remediation_applied'
  | 'recovery_applied'
  | 'review_result'
  | 'scm_action'
  | 'artifact_written'
  | 'run_completed';

export interface TrustTimelineEntry {
  seq: number;
  timestamp: string;
  kind: TrustTimelineEntryKind;
  /** Human-readable one-line description of the mutation/event. */
  summary: string;
  taskId: string | null;
}

export interface RemediationAuditEntry {
  seq: number;
  timestamp: string;
  taskId: string | null;
  action: string;
  applied: boolean;
}

export type RunFileChangeSummaryStatus = 'available' | 'missing' | 'unreadable';

export interface RunFileChangeEntry {
  path: string;
  changeType: 'added' | 'modified' | 'deleted' | 'changed';
  relevant: boolean;
}

export interface RunFileChangeSummary {
  status: RunFileChangeSummaryStatus;
  artifactPath: string | null;
  summary: string;
  changedFileCount: number;
  relevantChangedFileCount: number;
  files: RunFileChangeEntry[];
  message: string;
}

export interface RunTrustTimeline {
  runId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  stopReason: RalphStopReason | null;
  /** Chronological, operator-meaningful mutations/events. */
  entries: TrustTimelineEntry[];
  /** Auto-remediation audit trail: which remediation actions were applied/attempted. */
  remediationAudit: RemediationAuditEntry[];
  /** Relative paths of artifacts written during the run. */
  artifactsWritten: string[];
  /** File-level repository changes loaded from the run's durable diff summary. */
  fileChanges: RunFileChangeSummary | null;
  totals: {
    taskStateChanges: number;
    providerInvocations: number;
    remediationsApplied: number;
    recoveryActionsApplied: number;
    artifactsWritten: number;
    scmActions: number;
  };
}

export function normalizeRunDiffSummary(candidate: unknown): RalphDiffSummary | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }
  const record = candidate as Record<string, unknown>;
  if (typeof record.available !== 'boolean' || typeof record.summary !== 'string') {
    return null;
  }
  const changedFiles = Array.isArray(record.changedFiles)
    ? record.changedFiles.filter((item): item is string => typeof item === 'string')
    : [];
  const relevantChangedFiles = Array.isArray(record.relevantChangedFiles)
    ? record.relevantChangedFiles.filter((item): item is string => typeof item === 'string')
    : [];
  const statusTransitions = Array.isArray(record.statusTransitions)
    ? record.statusTransitions.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    available: record.available,
    gitAvailable: typeof record.gitAvailable === 'boolean' ? record.gitAvailable : record.available,
    summary: record.summary,
    changedFileCount: typeof record.changedFileCount === 'number' && Number.isFinite(record.changedFileCount)
      ? Math.max(0, Math.floor(record.changedFileCount))
      : changedFiles.length,
    relevantChangedFileCount: typeof record.relevantChangedFileCount === 'number' && Number.isFinite(record.relevantChangedFileCount)
      ? Math.max(0, Math.floor(record.relevantChangedFileCount))
      : relevantChangedFiles.length,
    changedFiles,
    relevantChangedFiles,
    statusTransitions,
    suggestedCheckpointRef: typeof record.suggestedCheckpointRef === 'string' ? record.suggestedCheckpointRef : undefined,
    beforeStatusPath: typeof record.beforeStatusPath === 'string' ? record.beforeStatusPath : undefined,
    afterStatusPath: typeof record.afterStatusPath === 'string' ? record.afterStatusPath : undefined
  };
}

export function buildUnavailableRunFileChangeSummary(input: {
  status: Exclude<RunFileChangeSummaryStatus, 'available'>;
  artifactPath?: string | null;
  message: string;
}): RunFileChangeSummary {
  return {
    status: input.status,
    artifactPath: input.artifactPath ?? null,
    summary: input.message,
    changedFileCount: 0,
    relevantChangedFileCount: 0,
    files: [],
    message: input.message
  };
}

function changeTypeFromTransition(transition: string | undefined): RunFileChangeEntry['changeType'] {
  const delimiter = transition?.lastIndexOf(': ') ?? -1;
  const statusPart = transition && delimiter >= 0 ? transition.slice(delimiter + 2) : transition;
  const match = statusPart?.match(/^(.*?)\s*->\s*(.*?)$/);
  const before = match?.[1]?.trim() ?? '';
  const after = match?.[2]?.trim() ?? '';
  if (!before && !after) {
    return 'changed';
  }
  if (after === 'clean' || after.includes('D')) {
    return 'deleted';
  }
  if (before === 'clean' && (after.includes('A') || after.includes('??'))) {
    return 'added';
  }
  if (after.includes('M') || before !== after) {
    return 'modified';
  }
  return 'changed';
}

export function buildRunFileChangeSummary(input: {
  diffSummary: RalphDiffSummary;
  artifactPath: string;
}): RunFileChangeSummary {
  const relevant = new Set(input.diffSummary.relevantChangedFiles);
  const transitionByPath = new Map<string, string>();
  for (const transition of input.diffSummary.statusTransitions) {
    const delimiter = transition.lastIndexOf(': ');
    if (delimiter > 0) {
      transitionByPath.set(transition.slice(0, delimiter), transition);
    }
  }
  const files = input.diffSummary.changedFiles.map((filePath) => ({
    path: filePath,
    changeType: changeTypeFromTransition(transitionByPath.get(filePath)),
    relevant: relevant.has(filePath)
  }));
  return {
    status: 'available',
    artifactPath: input.artifactPath,
    summary: input.diffSummary.summary,
    changedFileCount: input.diffSummary.changedFileCount,
    relevantChangedFileCount: input.diffSummary.relevantChangedFileCount,
    files,
    message: input.diffSummary.summary
  };
}

// Kinds that represent operator-meaningful timeline entries (others fold into totals only).
const TIMELINE_ENTRY_KINDS: ReadonlySet<TrustTimelineEntryKind> = new Set([
  'run_started',
  'task_selected',
  'task_state_changed',
  'provider_completed',
  'verifier_result',
  'remediation_applied',
  'recovery_applied',
  'review_result',
  'scm_action',
  'run_completed'
]);

function describeEvent(event: RalphRuntimeEvent): { kind: TrustTimelineEntryKind; summary: string; taskId: string | null } | null {
  switch (event.type) {
    case 'run_started':
      return { kind: 'run_started', summary: `Run started${event.mode ? ` (${event.mode})` : ''}.`, taskId: null };
    case 'run_completed':
      return { kind: 'run_completed', summary: `Run completed${event.stopReason ? ` — stop: ${event.stopReason}` : ''}.`, taskId: null };
    case 'task_selected':
      return { kind: 'task_selected', summary: `Selected task ${event.taskId}${event.title ? ` — ${event.title}` : ''}.`, taskId: event.taskId };
    case 'task_state_changed':
      return { kind: 'task_state_changed', summary: `Task ${event.taskId}: ${event.from ?? '?'} → ${event.to}${event.reason ? ` (${event.reason})` : ''}.`, taskId: event.taskId };
    case 'provider_completed':
      return { kind: 'provider_completed', summary: `Provider ${event.provider} completed: ${event.status}.`, taskId: event.taskId ?? null };
    case 'verifier_result':
      return { kind: 'verifier_result', summary: `Verifier ${event.verifier}: ${event.status}.`, taskId: event.taskId ?? null };
    case 'remediation_applied':
      return { kind: 'remediation_applied', summary: `Remediation ${event.action}: ${event.applied ? 'applied' : 'proposed (not applied)'}.`, taskId: event.taskId ?? null };
    case 'recovery_applied':
      return { kind: 'recovery_applied', summary: `Recovery ${event.action} applied${event.severity ? ` (severity ${event.severity})` : ''}.`, taskId: event.taskId ?? null };
    case 'review_result':
      return { kind: 'review_result', summary: `Review ${event.status}${event.anomalies ? ` (${event.anomalies} anomalies)` : ''}.`, taskId: event.taskId ?? null };
    case 'scm_action':
      return { kind: 'scm_action', summary: `SCM ${event.action}: ${event.status}.`, taskId: event.taskId ?? null };
    default:
      return null;
  }
}

/** Folds an ordered event journal into a post-run trust timeline. Pure. */
export function buildRunTrustTimeline(events: readonly RalphRuntimeEvent[]): RunTrustTimeline {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const entries: TrustTimelineEntry[] = [];
  const remediationAudit: RemediationAuditEntry[] = [];
  const artifactsWritten: string[] = [];
  const totals = {
    taskStateChanges: 0,
    providerInvocations: 0,
    remediationsApplied: 0,
    recoveryActionsApplied: 0,
    artifactsWritten: 0,
    scmActions: 0
  };

  let runId: string | null = ordered.length > 0 ? ordered[0].runId : null;
  let startedAt: string | null = null;
  let completedAt: string | null = null;
  let stopReason: RalphStopReason | null = null;

  for (const event of ordered) {
    runId = runId ?? event.runId;
    switch (event.type) {
      case 'run_started':
        startedAt = event.timestamp;
        break;
      case 'run_completed':
        completedAt = event.timestamp;
        stopReason = event.stopReason ?? null;
        break;
      case 'task_state_changed':
        totals.taskStateChanges += 1;
        break;
      case 'provider_invoked':
        totals.providerInvocations += 1;
        break;
      case 'remediation_applied':
        if (event.applied) {
          totals.remediationsApplied += 1;
        }
        remediationAudit.push({
          seq: event.seq,
          timestamp: event.timestamp,
          taskId: event.taskId ?? null,
          action: event.action,
          applied: event.applied
        });
        break;
      case 'recovery_applied':
        totals.recoveryActionsApplied += 1;
        break;
      case 'scm_action':
        totals.scmActions += 1;
        break;
      case 'artifact_written':
        totals.artifactsWritten += 1;
        artifactsWritten.push(event.relativePath);
        break;
      default:
        break;
    }

    const described = describeEvent(event);
    if (described && TIMELINE_ENTRY_KINDS.has(described.kind)) {
      entries.push({ seq: event.seq, timestamp: event.timestamp, ...described });
    }
  }

  return { runId, startedAt, completedAt, stopReason, entries, remediationAudit, artifactsWritten, fileChanges: null, totals };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export function renderExecutionIntentPreviewMarkdown(intent: ExecutionIntentPreview): string {
  return ['# Execution intent preview', '', ...intent.notes.map((note) => `- ${note}`)].join('\n');
}

export function renderRunTrustTimelineMarkdown(timeline: RunTrustTimeline): string {
  const lines: string[] = [
    '# Run trust timeline',
    '',
    `- Run: ${timeline.runId ?? 'unknown'}`,
    `- Started: ${timeline.startedAt ?? 'n/a'}`,
    `- Completed: ${timeline.completedAt ?? 'in progress'}`,
    `- Stop reason: ${timeline.stopReason ?? 'n/a'}`,
    `- Task state changes: ${timeline.totals.taskStateChanges}; remediations applied: ${timeline.totals.remediationsApplied}; recovery actions: ${timeline.totals.recoveryActionsApplied}; SCM actions: ${timeline.totals.scmActions}; artifacts written: ${timeline.totals.artifactsWritten}`,
    ''
  ];
  if (timeline.entries.length === 0) {
    lines.push('No timeline events recorded for this run.');
    return lines.join('\n');
  }
  lines.push('## Timeline');
  for (const entry of timeline.entries) {
    lines.push(`- [${entry.seq}] ${entry.summary}`);
  }
  if (timeline.remediationAudit.length > 0) {
    lines.push('', '## Auto-remediation audit');
    for (const audit of timeline.remediationAudit) {
      lines.push(`- ${audit.action} on ${audit.taskId ?? 'unknown task'}: ${audit.applied ? 'applied' : 'proposed (not applied)'}`);
    }
  }
  return lines.join('\n');
}

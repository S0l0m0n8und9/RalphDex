import * as path from 'path';
import { RalphCodexConfig } from '../config/types';
import { CodexCliSupport, CodexIdeCommandSupport } from '../services/codexCliSupport';
import { RalphWorkspaceFileStatus } from './stateManager';
import { RalphTaskFileInspection } from './taskFile';
import {
  RalphPreflightCategory,
  RalphPreflightDiagnostic,
  RalphPreflightReport,
  RalphTask,
  RalphTaskCounts,
  RalphValidationCommandReadiness
} from './types';

const CATEGORY_LABELS: Record<RalphPreflightCategory, string> = {
  taskGraph: 'Task graph',
  workspaceRuntime: 'Workspace/runtime',
  codexAdapter: 'Codex adapter',
  validationVerifier: 'Validation/verifier'
};

function createDiagnostic(
  category: RalphPreflightCategory,
  severity: RalphPreflightDiagnostic['severity'],
  code: string,
  message: string,
  details: Pick<RalphPreflightDiagnostic, 'taskId' | 'relatedTaskIds' | 'location' | 'relatedLocations'> = {}
): RalphPreflightDiagnostic {
  return {
    category,
    severity,
    code,
    message,
    ...details
  };
}

function relativePath(rootPath: string, target: string): string {
  return path.relative(rootPath, target) || '.';
}

function sectionSummary(category: RalphPreflightCategory, diagnostics: RalphPreflightDiagnostic[]): string {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
  const infos = diagnostics.filter((diagnostic) => diagnostic.severity === 'info').length;
  const parts: string[] = [];

  if (errors > 0) {
    parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
  }
  if (warnings > 0) {
    parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  }
  if (infos > 0) {
    parts.push(`${infos} info`);
  }

  return `${CATEGORY_LABELS[category]}: ${parts.join(', ') || 'ok'}`;
}

function sortDiagnostics(diagnostics: RalphPreflightDiagnostic[]): RalphPreflightDiagnostic[] {
  const severityRank = new Map<RalphPreflightDiagnostic['severity'], number>([
    ['error', 0],
    ['warning', 1],
    ['info', 2]
  ]);

  return [...diagnostics].sort((left, right) => {
    const leftRank = severityRank.get(left.severity) ?? 99;
    const rightRank = severityRank.get(right.severity) ?? 99;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    if (left.category !== right.category) {
      return left.category.localeCompare(right.category);
    }

    return left.message.localeCompare(right.message);
  });
}

export interface RalphPreflightInput {
  rootPath: string;
  workspaceTrusted: boolean;
  config: RalphCodexConfig;
  taskInspection: RalphTaskFileInspection;
  taskCounts: RalphTaskCounts | null;
  selectedTask: RalphTask | null;
  validationCommand: string | null;
  validationCommandReadiness: RalphValidationCommandReadiness;
  fileStatus: RalphWorkspaceFileStatus;
  createdPaths?: string[];
  codexCliSupport?: CodexCliSupport | null;
  ideCommandSupport?: CodexIdeCommandSupport | null;
}

export function buildPreflightReport(input: RalphPreflightInput): RalphPreflightReport {
  const diagnostics: RalphPreflightDiagnostic[] = [...input.taskInspection.diagnostics];

  if (!input.workspaceTrusted) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'info',
      'workspace_untrusted',
      'Workspace is not trusted; only read-only Ralph status inspection is supported.'
    ));
  }

  const missingFiles = [
    input.fileStatus.prdPath ? null : 'PRD',
    input.fileStatus.progressPath ? null : 'progress log',
    input.fileStatus.taskFilePath ? null : 'task file'
  ].filter((value): value is string => value !== null);

  if (missingFiles.length > 0) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'warning',
      'ralph_files_missing',
      `Missing Ralph workspace files: ${missingFiles.join(', ')}.`
    ));
  }

  if ((input.createdPaths ?? []).length > 0) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'info',
      'workspace_paths_initialized',
      `Initialized Ralph paths: ${input.createdPaths!.map((target) => relativePath(input.rootPath, target)).join(', ')}.`
    ));
  }

  if (input.taskInspection.taskFile && input.selectedTask === null) {
    const counts = input.taskCounts;
    if (counts && (counts.todo > 0 || counts.in_progress > 0 || counts.blocked > 0)) {
      diagnostics.push(createDiagnostic(
        'workspaceRuntime',
        'warning',
        'no_actionable_task',
        'No actionable task is currently selectable. Check blocked tasks and incomplete dependencies.'
      ));
    }
  }

  if (input.codexCliSupport) {
    if (input.codexCliSupport.check === 'pathMissing') {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'error',
        'codex_cli_missing',
        `Configured Codex CLI path does not exist: ${input.codexCliSupport.commandPath}.`
      ));
    } else if (input.codexCliSupport.check === 'pathNotExecutable') {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'error',
        'codex_cli_not_executable',
        `Configured Codex CLI path is not executable: ${input.codexCliSupport.commandPath}.`
      ));
    } else if (input.codexCliSupport.check === 'pathLookupAssumed') {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'warning',
        'codex_cli_path_lookup_assumed',
        `Codex CLI will be resolved from PATH at runtime: ${input.codexCliSupport.commandPath}. Availability is assumed until execution starts.`
      ));
    } else if (input.codexCliSupport.check === 'pathVerifiedExecutable') {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'info',
        'codex_cli_path_verified',
        `Configured Codex CLI executable was verified: ${input.codexCliSupport.commandPath}.`
      ));
    }
  }

  if (input.ideCommandSupport?.status === 'unavailable') {
    const missingCommands = input.ideCommandSupport.missingCommandIds
      .filter((commandId) => commandId && commandId !== 'none');
    diagnostics.push(createDiagnostic(
      'codexAdapter',
      'warning',
      'ide_command_strategy_unavailable',
      missingCommands.length > 0
        ? `Configured IDE command strategy is unavailable. Missing VS Code commands: ${missingCommands.join(', ')}. Clipboard handoff can still fall back.`
        : 'Configured IDE command strategy is unavailable because no usable VS Code command ids were configured. Clipboard handoff can still fall back.'
    ));
  } else if (input.ideCommandSupport?.status === 'available') {
    diagnostics.push(createDiagnostic(
      'codexAdapter',
      'info',
      'ide_command_strategy_available',
      `Configured IDE command strategy is available via ${input.ideCommandSupport.openSidebarCommandId} and ${input.ideCommandSupport.newChatCommandId}.`
    ));
  }

  if (input.config.verifierModes.includes('validationCommand')) {
    if (!input.validationCommand) {
      diagnostics.push(createDiagnostic(
        'validationVerifier',
        'warning',
        'validation_command_missing',
        'Validation-command verifier is enabled but no validation command was selected for this iteration.'
      ));
    } else if (input.validationCommandReadiness.status === 'executableConfirmed') {
      diagnostics.push(createDiagnostic(
        'validationVerifier',
        'info',
        'validation_command_executable_confirmed',
        `Validation command executable was confirmed before execution: ${input.validationCommandReadiness.executable ?? input.validationCommand}.`
      ));
    } else if (input.validationCommandReadiness.status === 'executableNotConfirmed') {
      diagnostics.push(createDiagnostic(
        'validationVerifier',
        'warning',
        'validation_command_executable_not_confirmed',
        `Validation command was selected but its executable could not be confirmed before execution: ${input.validationCommandReadiness.executable ?? input.validationCommand}.`
      ));
    } else {
      diagnostics.push(createDiagnostic(
        'validationVerifier',
        'info',
        'validation_command_selected_not_confirmed',
        `Validation command was selected but preflight could not confirm its executable cheaply: ${input.validationCommand}.`
      ));
    }
  }

  if (input.config.verifierModes.length === 0) {
    diagnostics.push(createDiagnostic(
      'validationVerifier',
      'info',
      'no_verifiers_enabled',
      'No post-iteration verifiers are enabled.'
    ));
  }

  const orderedDiagnostics = sortDiagnostics(diagnostics);
  const ready = !orderedDiagnostics.some((diagnostic) => diagnostic.severity === 'error');
  const byCategory = (category: RalphPreflightCategory) => orderedDiagnostics.filter((diagnostic) => diagnostic.category === category);
  const scopeSummary = [
    sectionSummary('taskGraph', byCategory('taskGraph')),
    sectionSummary('workspaceRuntime', byCategory('workspaceRuntime')),
    sectionSummary('codexAdapter', byCategory('codexAdapter')),
    sectionSummary('validationVerifier', byCategory('validationVerifier'))
  ].join(' | ');
  const selectionSummary = input.selectedTask
    ? `Selected task ${input.selectedTask.id}.`
    : 'No task selected.';
  const validationSummary = input.validationCommand
    ? [
      `Validation ${input.validationCommand}.`,
      input.validationCommandReadiness.status === 'executableConfirmed'
        ? 'Executable confirmed.'
        : input.validationCommandReadiness.status === 'executableNotConfirmed'
          ? 'Executable not confirmed.'
          : input.validationCommandReadiness.status === 'selected'
            ? 'Executable not checked.'
            : 'No validation command selected.'
    ].join(' ')
    : 'Validation none.';

  return {
    ready,
    summary: `Preflight ${ready ? 'ready' : 'blocked'}: ${selectionSummary} ${validationSummary} ${scopeSummary}`,
    diagnostics: orderedDiagnostics
  };
}

export function renderPreflightReport(report: RalphPreflightReport): string {
  const renderDiagnostic = (diagnostic: RalphPreflightDiagnostic): string =>
    `- ${diagnostic.severity} [${diagnostic.code}]: ${diagnostic.message}`;
  const sections = (Object.keys(CATEGORY_LABELS) as RalphPreflightCategory[]).map((category) => {
    const diagnostics = report.diagnostics.filter((diagnostic) => diagnostic.category === category);
    return [
      `## ${CATEGORY_LABELS[category]}`,
      diagnostics.length > 0
        ? diagnostics.map(renderDiagnostic).join('\n')
        : '- ok'
    ].join('\n');
  });

  return [
    '# Ralph Preflight',
    '',
    `- Ready: ${report.ready ? 'yes' : 'no'}`,
    `- Summary: ${report.summary}`,
    '',
    ...sections
  ].join('\n');
}

export function buildBlockingPreflightMessage(report: RalphPreflightReport): string {
  const blockingDiagnostics = report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  const firstReason = blockingDiagnostics[0]?.message ?? 'Unknown preflight failure.';
  return `Ralph preflight blocked iteration start. ${firstReason}`;
}

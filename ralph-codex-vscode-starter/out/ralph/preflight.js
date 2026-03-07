"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPreflightReport = buildPreflightReport;
exports.renderPreflightReport = renderPreflightReport;
exports.buildBlockingPreflightMessage = buildBlockingPreflightMessage;
const path = __importStar(require("path"));
const CATEGORY_LABELS = {
    taskGraph: 'Task graph',
    workspaceRuntime: 'Workspace/runtime',
    codexAdapter: 'Codex adapter',
    validationVerifier: 'Validation/verifier'
};
function createDiagnostic(category, severity, code, message, details = {}) {
    return {
        category,
        severity,
        code,
        message,
        ...details
    };
}
function relativePath(rootPath, target) {
    return path.relative(rootPath, target) || '.';
}
function sectionSummary(category, diagnostics) {
    const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
    const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
    const infos = diagnostics.filter((diagnostic) => diagnostic.severity === 'info').length;
    const parts = [];
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
function sortDiagnostics(diagnostics) {
    const severityRank = new Map([
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
function buildPreflightReport(input) {
    const diagnostics = [...input.taskInspection.diagnostics];
    if (!input.workspaceTrusted) {
        diagnostics.push(createDiagnostic('workspaceRuntime', 'info', 'workspace_untrusted', 'Workspace is not trusted; only read-only Ralph status inspection is supported.'));
    }
    const missingFiles = [
        input.fileStatus.prdPath ? null : 'PRD',
        input.fileStatus.progressPath ? null : 'progress log',
        input.fileStatus.taskFilePath ? null : 'task file'
    ].filter((value) => value !== null);
    if (missingFiles.length > 0) {
        diagnostics.push(createDiagnostic('workspaceRuntime', 'warning', 'ralph_files_missing', `Missing Ralph workspace files: ${missingFiles.join(', ')}.`));
    }
    if ((input.createdPaths ?? []).length > 0) {
        diagnostics.push(createDiagnostic('workspaceRuntime', 'info', 'workspace_paths_initialized', `Initialized Ralph paths: ${input.createdPaths.map((target) => relativePath(input.rootPath, target)).join(', ')}.`));
    }
    if (input.taskInspection.taskFile && input.selectedTask === null) {
        const counts = input.taskCounts;
        if (counts && (counts.todo > 0 || counts.in_progress > 0 || counts.blocked > 0)) {
            diagnostics.push(createDiagnostic('workspaceRuntime', 'warning', 'no_actionable_task', 'No actionable task is currently selectable. Check blocked tasks and incomplete dependencies.'));
        }
    }
    if (input.codexCliSupport) {
        if (input.codexCliSupport.check === 'pathMissing') {
            diagnostics.push(createDiagnostic('codexAdapter', 'error', 'codex_cli_missing', `Configured Codex CLI path does not exist: ${input.codexCliSupport.commandPath}.`));
        }
        else if (input.codexCliSupport.check === 'pathNotExecutable') {
            diagnostics.push(createDiagnostic('codexAdapter', 'error', 'codex_cli_not_executable', `Configured Codex CLI path is not executable: ${input.codexCliSupport.commandPath}.`));
        }
        else if (input.codexCliSupport.check === 'pathLookupAssumed') {
            diagnostics.push(createDiagnostic('codexAdapter', 'warning', 'codex_cli_path_lookup_assumed', `Codex CLI will be resolved from PATH at runtime: ${input.codexCliSupport.commandPath}. Availability is assumed until execution starts.`));
        }
        else if (input.codexCliSupport.check === 'pathVerifiedExecutable') {
            diagnostics.push(createDiagnostic('codexAdapter', 'info', 'codex_cli_path_verified', `Configured Codex CLI executable was verified: ${input.codexCliSupport.commandPath}.`));
        }
    }
    if (input.ideCommandSupport?.status === 'unavailable') {
        const missingCommands = input.ideCommandSupport.missingCommandIds
            .filter((commandId) => commandId && commandId !== 'none');
        diagnostics.push(createDiagnostic('codexAdapter', 'warning', 'ide_command_strategy_unavailable', missingCommands.length > 0
            ? `Configured IDE command strategy is unavailable. Missing VS Code commands: ${missingCommands.join(', ')}. Clipboard handoff can still fall back.`
            : 'Configured IDE command strategy is unavailable because no usable VS Code command ids were configured. Clipboard handoff can still fall back.'));
    }
    else if (input.ideCommandSupport?.status === 'available') {
        diagnostics.push(createDiagnostic('codexAdapter', 'info', 'ide_command_strategy_available', `Configured IDE command strategy is available via ${input.ideCommandSupport.openSidebarCommandId} and ${input.ideCommandSupport.newChatCommandId}.`));
    }
    if (input.config.verifierModes.includes('validationCommand')) {
        if (!input.validationCommand) {
            diagnostics.push(createDiagnostic('validationVerifier', 'warning', 'validation_command_missing', 'Validation-command verifier is enabled but no validation command was selected for this iteration.'));
        }
        else if (input.validationCommandReadiness.status === 'executableConfirmed') {
            diagnostics.push(createDiagnostic('validationVerifier', 'info', 'validation_command_executable_confirmed', `Validation command executable was confirmed before execution: ${input.validationCommandReadiness.executable ?? input.validationCommand}.`));
        }
        else if (input.validationCommandReadiness.status === 'executableNotConfirmed') {
            diagnostics.push(createDiagnostic('validationVerifier', 'warning', 'validation_command_executable_not_confirmed', `Validation command was selected but its executable could not be confirmed before execution: ${input.validationCommandReadiness.executable ?? input.validationCommand}.`));
        }
        else {
            diagnostics.push(createDiagnostic('validationVerifier', 'info', 'validation_command_selected_not_confirmed', `Validation command was selected but preflight could not confirm its executable cheaply: ${input.validationCommand}.`));
        }
    }
    if (input.config.verifierModes.length === 0) {
        diagnostics.push(createDiagnostic('validationVerifier', 'info', 'no_verifiers_enabled', 'No post-iteration verifiers are enabled.'));
    }
    const orderedDiagnostics = sortDiagnostics(diagnostics);
    const ready = !orderedDiagnostics.some((diagnostic) => diagnostic.severity === 'error');
    const byCategory = (category) => orderedDiagnostics.filter((diagnostic) => diagnostic.category === category);
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
function renderPreflightReport(report) {
    const renderDiagnostic = (diagnostic) => `- ${diagnostic.severity} [${diagnostic.code}]: ${diagnostic.message}`;
    const sections = Object.keys(CATEGORY_LABELS).map((category) => {
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
function buildBlockingPreflightMessage(report) {
    const blockingDiagnostics = report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    const firstReason = blockingDiagnostics[0]?.message ?? 'Unknown preflight failure.';
    return `Ralph preflight blocked iteration start. ${firstReason}`;
}
//# sourceMappingURL=preflight.js.map
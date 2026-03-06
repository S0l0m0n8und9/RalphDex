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
exports.choosePromptKind = choosePromptKind;
exports.createPromptFileName = createPromptFileName;
exports.createArtifactBaseName = createArtifactBaseName;
exports.buildPrompt = buildPrompt;
const path = __importStar(require("path"));
function section(title, body) {
    return `## ${title}\n${body.trim()}\n`;
}
function repoFacts(summary) {
    const lines = [
        `- Workspace: ${summary.workspaceName}`,
        `- Root path: ${summary.rootPath}`,
        `- Manifests: ${summary.manifests.join(', ') || 'none detected'}`,
        `- Package managers: ${summary.packageManagers.join(', ') || 'unknown'}`,
        `- CI files: ${summary.ciFiles.join(', ') || 'none detected'}`,
        `- Docs: ${summary.docs.join(', ') || 'none detected'}`,
        `- Source roots: ${summary.sourceRoots.join(', ') || 'none detected'}`,
        `- Lifecycle commands: ${summary.lifecycleCommands.join(', ') || 'none detected'}`,
        `- Test signals: ${summary.testSignals.join(' | ') || 'unknown'}`
    ];
    if (summary.packageJson?.name) {
        lines.push(`- package.json name: ${summary.packageJson.name}`);
    }
    if (summary.packageJson?.hasWorkspaces) {
        lines.push('- package.json workspaces: yes');
    }
    if (summary.notes.length > 0) {
        lines.push(`- Notes: ${summary.notes.join(' | ')}`);
    }
    return lines.join('\n');
}
function taskSummary(taskCounts) {
    return [
        `- todo: ${taskCounts.todo}`,
        `- in_progress: ${taskCounts.in_progress}`,
        `- blocked: ${taskCounts.blocked}`,
        `- done: ${taskCounts.done}`
    ].join('\n');
}
function stateSummary(state, paths) {
    const lines = [
        `- Next iteration number: ${state.nextIteration}`,
        `- Last prompt kind: ${state.lastPromptKind ?? 'none yet'}`,
        `- Last prompt path: ${state.lastPromptPath ? path.relative(paths.rootPath, state.lastPromptPath) : 'none yet'}`,
        `- Last run: ${state.lastRun ? `${state.lastRun.status} at iteration ${state.lastRun.iteration}` : 'none yet'}`,
        `- PRD path: ${path.relative(paths.rootPath, paths.prdPath)}`,
        `- Progress path: ${path.relative(paths.rootPath, paths.progressPath)}`,
        `- Task file path: ${path.relative(paths.rootPath, paths.taskFilePath)}`,
        `- Runtime state path: ${path.relative(paths.rootPath, paths.stateFilePath)}`
    ];
    if (state.lastRun?.summary) {
        lines.push(`- Last run summary: ${state.lastRun.summary}`);
    }
    return lines.join('\n');
}
function choosePromptKind(state) {
    return state.runHistory.length === 0 ? 'bootstrap' : 'iteration';
}
function createPromptFileName(kind, iteration) {
    return `${kind}-${String(iteration).padStart(3, '0')}.prompt.md`;
}
function createArtifactBaseName(kind, iteration) {
    return `${kind}-${String(iteration).padStart(3, '0')}`;
}
function buildPrompt(input) {
    const title = input.kind === 'bootstrap'
        ? '# Ralph Codex Bootstrap Prompt'
        : `# Ralph Codex Iteration ${input.iteration}`;
    const intro = input.kind === 'bootstrap'
        ? 'You are starting a fresh Codex run inside an existing repository. Treat repository files as the source of truth.'
        : 'You are a fresh Codex run continuing work from durable repository state, not chat memory.';
    const operatingRules = [
        '- Read AGENTS.md, the PRD, the progress log, and the task file before making changes.',
        '- Do not invent undocumented Codex IDE APIs or unsupported prompt injection paths.',
        '- Prefer thin, reliable architecture and file-backed state over clever abstractions.',
        '- Make the smallest coherent change that materially advances the objective.',
        '- Validate using the repository’s real commands when they exist.',
        '- Update durable Ralph files when the task state or progress changes.'
    ].join('\n');
    const executionContract = [
        '1. Summarize what is real, stubbed, or risky before editing when that context matters.',
        '2. Pick the highest-value executable task.',
        '3. Implement the smallest coherent improvement.',
        '4. Run validation and report the concrete result.',
        '5. End with changed files, validation results, assumptions, limitations, and next steps.'
    ].join('\n');
    return [
        title,
        '',
        intro,
        '',
        section('Objective / PRD', input.objectiveText),
        section('Workspace Snapshot', repoFacts(input.summary)),
        section('Ralph Runtime State', stateSummary(input.state, input.paths)),
        section('Task Status Summary', taskSummary(input.taskCounts)),
        section('Current Progress Log', input.progressText || 'No progress log found.'),
        section('Current Task File', input.tasksText || 'No task file found.'),
        section('Operating Rules', operatingRules),
        section('Execution Contract', executionContract)
    ].join('\n');
}
//# sourceMappingURL=promptBuilder.js.map
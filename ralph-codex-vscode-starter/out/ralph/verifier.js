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
exports.normalizeValidationCommand = normalizeValidationCommand;
exports.captureCoreState = captureCoreState;
exports.captureGitStatus = captureGitStatus;
exports.chooseValidationCommand = chooseValidationCommand;
exports.inspectValidationCommandReadiness = inspectValidationCommandReadiness;
exports.runValidationCommandVerifier = runValidationCommandVerifier;
exports.runTaskStateVerifier = runTaskStateVerifier;
exports.runFileChangeVerifier = runFileChangeVerifier;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const taskFile_1 = require("./taskFile");
const loopLogic_1 = require("./loopLogic");
const processRunner_1 = require("../services/processRunner");
function hashText(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}
async function readText(target) {
    return fs.readFile(target, 'utf8').catch(() => '');
}
function parseGitStatus(raw) {
    return raw
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.length >= 3)
        .map((line) => {
        const status = line.slice(0, 2).trim() || '??';
        const body = line.slice(3).trim();
        const parsedPath = body.includes(' -> ') ? body.split(' -> ').at(-1) ?? body : body;
        return {
            status,
            path: parsedPath
        };
    });
}
function isRelevantChange(relativePath) {
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized === '.ralph/state.json') {
        return false;
    }
    if (normalized.startsWith('.ralph/prompts/')
        || normalized.startsWith('.ralph/runs/')
        || normalized.startsWith('.ralph/logs/')
        || normalized.startsWith('.ralph/artifacts/')) {
        return false;
    }
    return true;
}
function tokenizeShellCommand(command) {
    const tokens = [];
    let current = '';
    let quote = null;
    let escaped = false;
    for (const char of command) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }
        if (quote === '\'') {
            if (char === '\'') {
                quote = null;
            }
            else {
                current += char;
            }
            continue;
        }
        if (quote === '"') {
            if (char === '"') {
                quote = null;
            }
            else if (char === '\\') {
                escaped = true;
            }
            else {
                current += char;
            }
            continue;
        }
        if (char === '"' || char === '\'') {
            quote = char;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (/\s/.test(char)) {
            if (current.length > 0) {
                tokens.push(current);
                current = '';
            }
            continue;
        }
        current += char;
    }
    if (current.length > 0) {
        tokens.push(current);
    }
    return tokens;
}
function extractExecutableToken(command) {
    const tokens = tokenizeShellCommand(command);
    for (const token of tokens) {
        if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token)) {
            continue;
        }
        return token;
    }
    return null;
}
function usesExplicitExecutablePath(executable) {
    return path.isAbsolute(executable) || executable.includes(path.sep) || executable.includes('/');
}
async function isExecutable(commandPath) {
    try {
        await fs.access(commandPath, fs.constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
function shellQuote(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function stripOuterQuotes(value) {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
function normalizeValidationCommand(input) {
    if (!input.command) {
        return null;
    }
    const match = /^\s*cd\s+("[^"]+"|'[^']+'|[^&|;]+?)\s*&&\s*(.+)\s*$/s.exec(input.command);
    if (!match) {
        return input.command;
    }
    const target = stripOuterQuotes(match[1]);
    const normalizedVerificationRoot = path.resolve(input.verificationRootPath);
    const normalizedTargetFromWorkspaceRoot = path.resolve(input.workspaceRootPath, target);
    if (normalizedTargetFromWorkspaceRoot === normalizedVerificationRoot) {
        return match[2].trim();
    }
    if (path.resolve(input.workspaceRootPath) === normalizedVerificationRoot) {
        const normalizedTargetFromVerifierParent = path.resolve(path.dirname(normalizedVerificationRoot), target);
        if (normalizedTargetFromVerifierParent === normalizedVerificationRoot) {
            return match[2].trim();
        }
    }
    return input.command;
}
async function writeJsonArtifact(target, value) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    return target;
}
async function captureCoreState(paths) {
    const [objectiveText, progressText, tasksText] = await Promise.all([
        readText(paths.prdPath),
        readText(paths.progressPath),
        readText(paths.taskFilePath)
    ]);
    let taskFile;
    let taskFileError = null;
    try {
        taskFile = (0, taskFile_1.parseTaskFile)(tasksText);
    }
    catch (error) {
        taskFile = { version: 2, tasks: [] };
        taskFileError = error instanceof Error ? error.message : String(error);
    }
    return {
        objectiveText,
        progressText,
        tasksText,
        taskFile,
        taskFileError,
        hashes: {
            objective: hashText(objectiveText),
            progress: hashText(progressText),
            tasks: hashText(tasksText)
        }
    };
}
async function captureGitStatus(rootPath) {
    const probe = await (0, processRunner_1.runProcess)('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: rootPath
    }).catch(() => null);
    if (!probe || probe.code !== 0 || probe.stdout.trim() !== 'true') {
        return {
            available: false,
            raw: '',
            entries: []
        };
    }
    const status = await (0, processRunner_1.runProcess)('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
        cwd: rootPath
    });
    return {
        available: status.code === 0,
        raw: status.stdout,
        entries: status.code === 0 ? parseGitStatus(status.stdout) : []
    };
}
function chooseValidationCommand(workspaceScan, selectedTask, overrideCommand) {
    if (overrideCommand.trim()) {
        return overrideCommand.trim();
    }
    if (selectedTask?.validation?.trim()) {
        return selectedTask.validation.trim();
    }
    return workspaceScan.validationCommands[0] ?? null;
}
async function inspectValidationCommandReadiness(input) {
    if (!input.command) {
        return {
            command: null,
            status: 'missing',
            executable: null
        };
    }
    const executable = extractExecutableToken(input.command);
    if (!executable) {
        return {
            command: input.command,
            status: 'selected',
            executable: null
        };
    }
    if (usesExplicitExecutablePath(executable)) {
        return {
            command: input.command,
            status: await isExecutable(executable) ? 'executableConfirmed' : 'executableNotConfirmed',
            executable
        };
    }
    try {
        const lookup = process.platform === 'win32'
            ? await (0, processRunner_1.runProcess)('where', [executable], { cwd: input.rootPath })
            : await (0, processRunner_1.runProcess)('sh', ['-lc', `command -v ${shellQuote(executable)}`], { cwd: input.rootPath });
        const resolvedExecutable = lookup.stdout
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.length > 0)
            ?? executable;
        return {
            command: input.command,
            status: lookup.code === 0 ? 'executableConfirmed' : 'executableNotConfirmed',
            executable: resolvedExecutable
        };
    }
    catch {
        return {
            command: input.command,
            status: 'selected',
            executable
        };
    }
}
async function runValidationCommandVerifier(input) {
    if (!input.command) {
        return {
            command: null,
            stdout: '',
            stderr: '',
            exitCode: null,
            result: {
                verifier: 'validationCommand',
                status: 'skipped',
                summary: 'No validation command was selected for this iteration.',
                warnings: [],
                errors: []
            }
        };
    }
    const run = await (0, processRunner_1.runProcess)(input.command, [], {
        cwd: input.rootPath,
        shell: true
    });
    const stdoutPath = path.join(input.artifactDir, 'validation-command.stdout.log');
    const stderrPath = path.join(input.artifactDir, 'validation-command.stderr.log');
    const summaryPath = path.join(input.artifactDir, 'validation-command.json');
    await fs.mkdir(input.artifactDir, { recursive: true });
    await Promise.all([
        fs.writeFile(stdoutPath, run.stdout, 'utf8'),
        fs.writeFile(stderrPath, run.stderr, 'utf8')
    ]);
    const failureSignature = (0, loopLogic_1.buildValidationFailureSignature)(input.command, run.code, run.stdout, run.stderr);
    const result = {
        verifier: 'validationCommand',
        status: run.code === 0 ? 'passed' : 'failed',
        summary: run.code === 0
            ? `Validation command passed: ${input.command}`
            : `Validation command failed with exit code ${run.code}: ${input.command}`,
        warnings: [],
        errors: run.code === 0 ? [] : [`Validation command exited with ${run.code}.`],
        command: input.command,
        artifactPath: summaryPath,
        failureSignature,
        metadata: {
            exitCode: run.code,
            taskValidationHint: input.taskValidationHint ?? null,
            normalizedValidationCommandFrom: input.normalizedValidationCommandFrom ?? null,
            stdoutPath,
            stderrPath
        }
    };
    await writeJsonArtifact(summaryPath, {
        command: input.command,
        taskValidationHint: input.taskValidationHint ?? null,
        normalizedValidationCommandFrom: input.normalizedValidationCommandFrom ?? null,
        exitCode: run.code,
        stdoutPath,
        stderrPath,
        failureSignature
    });
    return {
        command: input.command,
        stdout: run.stdout,
        stderr: run.stderr,
        exitCode: run.code,
        result
    };
}
async function runTaskStateVerifier(input) {
    const selectedTaskBefore = (0, taskFile_1.findTaskById)(input.before.taskFile, input.selectedTaskId);
    const selectedTaskAfter = (0, taskFile_1.findTaskById)(input.after.taskFile, input.selectedTaskId);
    const progressChanged = input.before.hashes.progress !== input.after.hashes.progress;
    const taskFileChanged = input.before.hashes.tasks !== input.after.hashes.tasks;
    const selectedTaskCompleted = selectedTaskAfter?.status === 'done';
    const selectedTaskBlocked = selectedTaskAfter?.status === 'blocked';
    const humanReviewNeeded = (0, loopLogic_1.containsHumanReviewMarker)(selectedTaskAfter?.blocker)
        || (0, loopLogic_1.containsHumanReviewMarker)(selectedTaskAfter?.notes);
    const summaryPath = path.join(input.artifactDir, 'task-state.json');
    let status = 'skipped';
    let summary = 'No task-state progress was detected.';
    const warnings = [];
    const errors = [];
    if (!input.selectedTaskId) {
        if (progressChanged || taskFileChanged) {
            status = 'passed';
            summary = 'Durable Ralph task/progress files changed during a no-task iteration.';
        }
        else {
            summary = 'No Ralph task was selected for task-state verification.';
        }
    }
    else if (input.after.taskFileError) {
        status = 'failed';
        summary = `Task file could not be parsed after iteration for ${input.selectedTaskId}.`;
        errors.push(input.after.taskFileError);
    }
    else if (selectedTaskCompleted) {
        status = 'passed';
        summary = `Selected task ${input.selectedTaskId} is marked done.`;
    }
    else if (selectedTaskBlocked) {
        status = 'failed';
        summary = `Selected task ${input.selectedTaskId} is blocked.`;
        errors.push(selectedTaskAfter?.blocker ?? 'Task status is blocked.');
    }
    else if (selectedTaskBefore?.status !== selectedTaskAfter?.status) {
        status = 'passed';
        summary = `Selected task ${input.selectedTaskId} changed from ${selectedTaskBefore?.status ?? 'missing'} to ${selectedTaskAfter?.status ?? 'missing'}.`;
    }
    else if (progressChanged || taskFileChanged) {
        status = 'passed';
        summary = `Durable Ralph task/progress files changed for ${input.selectedTaskId}.`;
    }
    else {
        warnings.push('Task and progress files were unchanged during the iteration.');
    }
    await writeJsonArtifact(summaryPath, {
        selectedTaskId: input.selectedTaskId,
        selectedTaskBefore,
        selectedTaskAfter,
        taskFileError: input.after.taskFileError,
        progressChanged,
        taskFileChanged,
        humanReviewNeeded
    });
    return {
        selectedTaskAfter,
        selectedTaskCompleted,
        selectedTaskBlocked,
        humanReviewNeeded,
        progressChanged,
        taskFileChanged,
        result: {
            verifier: 'taskState',
            status,
            summary,
            warnings,
            errors,
            artifactPath: summaryPath
        }
    };
}
async function runFileChangeVerifier(input) {
    const changedFiles = new Set();
    const beforeStatuses = new Map(input.beforeGit.entries.map((entry) => [entry.path, entry.status]));
    const afterStatuses = new Map(input.afterGit.entries.map((entry) => [entry.path, entry.status]));
    for (const [filePath, status] of afterStatuses) {
        if (beforeStatuses.get(filePath) !== status) {
            changedFiles.add(filePath);
        }
    }
    for (const [filePath] of beforeStatuses) {
        if (!afterStatuses.has(filePath)) {
            changedFiles.add(filePath);
        }
    }
    if (input.before.hashes.objective !== input.after.hashes.objective) {
        changedFiles.add('.ralph/prd.md');
    }
    if (input.before.hashes.progress !== input.after.hashes.progress) {
        changedFiles.add('.ralph/progress.md');
    }
    if (input.before.hashes.tasks !== input.after.hashes.tasks) {
        changedFiles.add('.ralph/tasks.json');
    }
    const orderedChangedFiles = Array.from(changedFiles).sort();
    const relevantChangedFiles = orderedChangedFiles.filter((item) => isRelevantChange(item));
    const statusTransitions = orderedChangedFiles.map((item) => {
        const beforeStatus = beforeStatuses.get(item) ?? 'clean';
        const afterStatus = afterStatuses.get(item) ?? 'clean';
        return `${item}: ${beforeStatus} -> ${afterStatus}`;
    });
    const suggestedCheckpointRef = relevantChangedFiles.length > 0
        ? `ralph/iter-${path.basename(input.artifactDir)}`
        : undefined;
    const diffSummary = {
        available: input.beforeGit.available || input.afterGit.available || orderedChangedFiles.length > 0,
        gitAvailable: input.beforeGit.available || input.afterGit.available,
        summary: relevantChangedFiles.length > 0
            ? `Detected ${relevantChangedFiles.length} relevant changed file(s) out of ${orderedChangedFiles.length} total changes.`
            : orderedChangedFiles.length > 0
                ? `Detected ${orderedChangedFiles.length} change(s), but none outside Ralph-managed files.`
                : 'No relevant file changes were detected.',
        changedFileCount: orderedChangedFiles.length,
        relevantChangedFileCount: relevantChangedFiles.length,
        changedFiles: orderedChangedFiles,
        relevantChangedFiles,
        statusTransitions,
        suggestedCheckpointRef,
        beforeStatusPath: input.beforeGit.available ? path.join(input.artifactDir, 'git-status-before.txt') : undefined,
        afterStatusPath: input.afterGit.available ? path.join(input.artifactDir, 'git-status-after.txt') : undefined
    };
    const summaryPath = path.join(input.artifactDir, 'git-diff.json');
    await writeJsonArtifact(summaryPath, diffSummary);
    return {
        diffSummary,
        result: {
            verifier: 'gitDiff',
            status: relevantChangedFiles.length > 0 ? 'passed' : 'failed',
            summary: diffSummary.summary,
            warnings: relevantChangedFiles.length > 0 ? [] : ['No relevant workspace changes were detected.'],
            errors: [],
            artifactPath: summaryPath,
            metadata: {
                changedFiles: orderedChangedFiles,
                relevantChangedFiles
            }
        }
    };
}
//# sourceMappingURL=verifier.js.map
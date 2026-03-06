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
exports.resolveIterationArtifactPaths = resolveIterationArtifactPaths;
exports.ensureIterationArtifactDirectory = ensureIterationArtifactDirectory;
exports.writeIterationArtifacts = writeIterationArtifacts;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
function stringifyJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
function resolveIterationArtifactPaths(artifactRootDir, iteration) {
    const directory = path.join(artifactRootDir, `iteration-${String(iteration).padStart(3, '0')}`);
    return {
        directory,
        promptPath: path.join(directory, 'prompt.md'),
        stdoutPath: path.join(directory, 'stdout.log'),
        stderrPath: path.join(directory, 'stderr.log'),
        executionSummaryPath: path.join(directory, 'execution-summary.json'),
        verifierSummaryPath: path.join(directory, 'verifier-summary.json'),
        diffSummaryPath: path.join(directory, 'diff-summary.json'),
        iterationResultPath: path.join(directory, 'iteration-result.json'),
        gitStatusBeforePath: path.join(directory, 'git-status-before.txt'),
        gitStatusAfterPath: path.join(directory, 'git-status-after.txt')
    };
}
async function ensureIterationArtifactDirectory(paths) {
    await fs.mkdir(paths.directory, { recursive: true });
}
async function writeIterationArtifacts(input) {
    await ensureIterationArtifactDirectory(input.paths);
    await Promise.all([
        fs.writeFile(input.paths.promptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
        fs.writeFile(input.paths.stdoutPath, input.stdout, 'utf8'),
        fs.writeFile(input.paths.stderrPath, input.stderr, 'utf8'),
        fs.writeFile(input.paths.executionSummaryPath, stringifyJson(input.executionSummary), 'utf8'),
        fs.writeFile(input.paths.verifierSummaryPath, stringifyJson(input.verifierSummary), 'utf8'),
        fs.writeFile(input.paths.iterationResultPath, stringifyJson(input.result), 'utf8'),
        input.diffSummary
            ? fs.writeFile(input.paths.diffSummaryPath, stringifyJson(input.diffSummary), 'utf8')
            : Promise.resolve(),
        input.gitStatusBefore !== undefined
            ? fs.writeFile(input.paths.gitStatusBeforePath, input.gitStatusBefore, 'utf8')
            : Promise.resolve(),
        input.gitStatusAfter !== undefined
            ? fs.writeFile(input.paths.gitStatusAfterPath, input.gitStatusAfter, 'utf8')
            : Promise.resolve()
    ]);
}
//# sourceMappingURL=artifactStore.js.map
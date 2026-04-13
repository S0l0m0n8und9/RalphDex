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
exports.CliExecCodexStrategy = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("../ralph/integrity");
const processRunner_1 = require("../services/processRunner");
const codexCliProvider_1 = require("./codexCliProvider");
async function hasGitMetadata(rootPath) {
    try {
        await fs.access(path.join(rootPath, '.git'));
        return true;
    }
    catch {
        return false;
    }
}
class CliExecCodexStrategy {
    logger;
    id = 'cliExec';
    provider;
    constructor(logger, provider) {
        this.logger = logger;
        this.provider = provider ?? new codexCliProvider_1.CodexCliProvider({
            reasoningEffort: 'medium',
            sandboxMode: 'workspace-write',
            approvalMode: 'never'
        });
    }
    async runExec(request) {
        await fs.mkdir(path.dirname(request.lastMessagePath), { recursive: true });
        await fs.mkdir(path.dirname(request.transcriptPath), { recursive: true });
        const stdinHash = (0, integrity_1.hashText)(request.prompt);
        if (stdinHash !== request.promptHash) {
            throw new Error(`Execution integrity check failed before launch: stdin payload hash ${stdinHash} did not match planned prompt hash ${request.promptHash}.`);
        }
        let result;
        if (this.provider.executeDirectly) {
            this.logger.info(`Starting ${this.provider.id} direct HTTPS exec.`, {
                workspaceRoot: request.workspaceRoot,
                executionRoot: request.executionRoot,
                promptPath: request.promptPath
            });
            result = await this.provider.executeDirectly(request);
        }
        else {
            const skipGitCheck = !(await hasGitMetadata(request.executionRoot));
            const launchSpec = this.provider.prepareLaunchSpec
                ? await this.provider.prepareLaunchSpec(request, skipGitCheck)
                : this.provider.buildLaunchSpec(request, skipGitCheck);
            const args = launchSpec.args;
            this.logger.info(`Starting ${this.provider.id} CLI exec.`, {
                commandPath: request.commandPath,
                workspaceRoot: request.workspaceRoot,
                executionRoot: request.executionRoot,
                promptPath: request.promptPath,
                launchCwd: launchSpec.cwd,
                args
            });
            let processResult;
            try {
                processResult = await (0, processRunner_1.runProcess)(request.commandPath, args, {
                    cwd: launchSpec.cwd,
                    stdinText: launchSpec.stdinText,
                    shell: launchSpec.shell,
                    env: launchSpec.env,
                    onStdoutChunk: request.onStdoutChunk,
                    onStderrChunk: request.onStderrChunk,
                    timeoutMs: request.timeoutMs
                });
            }
            catch (error) {
                if (error instanceof processRunner_1.ProcessLaunchError) {
                    throw new Error(this.provider.describeLaunchError(request.commandPath, error), { cause: error });
                }
                throw error;
            }
            const lastMessage = await this.provider.extractResponseText(processResult.stdout, processResult.stderr, request.lastMessagePath);
            const cliWarnings = [];
            if (request.promptCaching === 'force') {
                cliWarnings.push(`Prompt caching is set to "force" but the active provider "${this.provider.id}" does not support explicit cache_control markers. ` +
                    'Caching will not be applied. Use provider "azure-foundry" (direct-HTTPS) to enable prompt caching.');
            }
            result = {
                strategy: this.id,
                success: processResult.code === 0,
                message: this.provider.summarizeResult({
                    exitCode: processResult.code,
                    stderr: processResult.stderr,
                    lastMessage
                }),
                warnings: cliWarnings,
                exitCode: processResult.code,
                stdout: processResult.stdout,
                stderr: processResult.stderr,
                args,
                stdinHash,
                transcriptPath: request.transcriptPath,
                lastMessagePath: request.lastMessagePath,
                lastMessage,
                executionCostUsd: this.provider.extractExecutionCostUsd
                    ? this.provider.extractExecutionCostUsd(processResult.stdout)
                    : null
            };
        }
        await fs.writeFile(request.transcriptPath, `${this.provider.buildTranscript(result, request).trimEnd()}\n`, 'utf8');
        return result;
    }
}
exports.CliExecCodexStrategy = CliExecCodexStrategy;
//# sourceMappingURL=cliExecStrategy.js.map
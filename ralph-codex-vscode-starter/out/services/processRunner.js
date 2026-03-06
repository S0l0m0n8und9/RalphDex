"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runProcess = runProcess;
const child_process_1 = require("child_process");
async function runProcess(command, args, options) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, {
            cwd: options.cwd,
            shell: process.platform === 'win32'
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            stdout += text;
            options.onStdoutChunk?.(text);
        });
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr += text;
            options.onStderrChunk?.(text);
        });
        child.on('error', reject);
        child.on('close', (code) => {
            resolve({
                code: code ?? 1,
                stdout,
                stderr
            });
        });
        if (options.stdinText !== undefined) {
            child.stdin.write(options.stdinText);
            child.stdin.end();
        }
    });
}
//# sourceMappingURL=processRunner.js.map
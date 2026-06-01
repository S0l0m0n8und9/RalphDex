"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StdoutHost = void 0;
exports.createStdoutHost = createStdoutHost;
const shimConfig_1 = require("./shimConfig");
const defaultLogSink = (text) => process.stdout.write(text);
class StdoutOutputChannel {
    write;
    name = 'Ralph Shim';
    constructor(write = defaultLogSink) {
        this.write = write;
    }
    append(value) {
        this.write(value);
    }
    appendLine(value) {
        this.write(`${value}\n`);
    }
    replace(value) {
        this.write(`${value}\n`);
    }
    clear() { }
    hide() { }
    show() { }
    dispose() { }
}
class NoOpProgress {
    report() { }
}
class NoOpCommandExecutor {
    executeCommand() {
        return Promise.resolve(undefined);
    }
}
class StdoutHost {
    outputChannel;
    progress;
    configuration;
    commands;
    constructor(workspaceRoot, env = process.env, logSink = defaultLogSink) {
        this.outputChannel = new StdoutOutputChannel(logSink);
        this.progress = new NoOpProgress();
        this.configuration = (0, shimConfig_1.createShimWorkspaceConfiguration)(workspaceRoot, env);
        this.commands = new NoOpCommandExecutor();
    }
}
exports.StdoutHost = StdoutHost;
function createStdoutHost(workspaceRoot, env = process.env, logSink = defaultLogSink) {
    return new StdoutHost(workspaceRoot, env, logSink);
}
//# sourceMappingURL=stdoutHost.js.map
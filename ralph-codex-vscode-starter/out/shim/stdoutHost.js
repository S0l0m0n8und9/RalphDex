"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StdoutHost = void 0;
exports.createStdoutHost = createStdoutHost;
const shimConfig_1 = require("./shimConfig");
class StdoutOutputChannel {
    appendLine(value) {
        console.log(value);
    }
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
    constructor(workspaceRoot, env = process.env) {
        this.outputChannel = new StdoutOutputChannel();
        this.progress = new NoOpProgress();
        this.configuration = (0, shimConfig_1.createShimWorkspaceConfiguration)(workspaceRoot, env);
        this.commands = new NoOpCommandExecutor();
    }
}
exports.StdoutHost = StdoutHost;
function createStdoutHost(workspaceRoot, env = process.env) {
    return new StdoutHost(workspaceRoot, env);
}
//# sourceMappingURL=stdoutHost.js.map
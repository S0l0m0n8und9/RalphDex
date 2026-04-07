"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installVscodeShim = installVscodeShim;
const node_module_1 = __importDefault(require("node:module"));
const node_path_1 = __importDefault(require("node:path"));
let installedShim = null;
function createUri(fsPath) {
    return {
        scheme: 'file',
        fsPath: node_path_1.default.resolve(fsPath)
    };
}
function installVscodeShim(workspaceRoot, host) {
    if (installedShim) {
        return;
    }
    const workspaceFolder = {
        uri: createUri(workspaceRoot),
        name: node_path_1.default.basename(workspaceRoot),
        index: 0
    };
    installedShim = {
        Uri: {
            file: createUri
        },
        commands: {
            async getCommands(_filterInternal) {
                return [];
            },
            async executeCommand(command, ...args) {
                return host.commands.executeCommand(command, ...args);
            }
        },
        workspace: {
            isTrusted: true,
            workspaceFolders: [workspaceFolder],
            getConfiguration(section, _scope) {
                if (section && section !== 'ralphCodex') {
                    return {
                        get(_key, defaultValue) {
                            return defaultValue;
                        },
                        inspect(key) {
                            return { key };
                        }
                    };
                }
                return {
                    get(key, defaultValue) {
                        return host.configuration.get(key, defaultValue);
                    },
                    inspect(key) {
                        return host.configuration.inspect(key);
                    }
                };
            }
        },
        window: {
            activeTextEditor: undefined
        }
    };
    const originalLoad = node_module_1.default._load;
    node_module_1.default._load = function patchedLoad(request, parent, isMain) {
        if (request === 'vscode') {
            return installedShim;
        }
        return originalLoad.call(this, request, parent, isMain);
    };
}
//# sourceMappingURL=installVscodeShim.js.map
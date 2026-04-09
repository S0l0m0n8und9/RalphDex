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
exports.RalphStatusBar = void 0;
exports.showStatusBarQuickPick = showStatusBarQuickPick;
const vscode = __importStar(require("vscode"));
const STATUS_ICONS = {
    idle: '$(terminal)',
    running: '$(sync~spin)',
    stopped: '$(primitive-square)'
};
const STATE_GLYPHS = {
    idle: '●',
    running: '▸',
    stopped: '■'
};
/**
 * Persistent status bar item that shows Ralph's current loop state.
 * Click opens a quick-pick of common actions.
 */
class RalphStatusBar {
    item;
    state;
    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.item.command = 'ralphCodex.statusBarQuickPick';
        this.state = {
            loopState: 'idle',
            currentIteration: 0,
            iterationCap: 0,
            selectedTaskId: null,
            selectedTaskTitle: null,
            lastClassification: null,
            stopReason: null
        };
        this.render();
        this.item.show();
    }
    updateFromWatchedState(watched) {
        if (this.state.loopState === 'running') {
            // Don't overwrite running state from file changes
            return;
        }
        const ws = watched.workspaceState;
        this.state = {
            ...this.state,
            selectedTaskId: watched.selectedTaskId,
            selectedTaskTitle: watched.taskFile?.tasks.find((t) => t.id === watched.selectedTaskId)?.title ?? null,
            currentIteration: ws?.nextIteration ? ws.nextIteration - 1 : 0,
            lastClassification: ws?.lastIteration?.completionClassification ?? null,
            stopReason: ws?.lastIteration?.stopReason ?? null,
            loopState: ws?.lastIteration?.stopReason ? 'stopped' : 'idle'
        };
        this.render();
    }
    updateFromBroadcast(event) {
        switch (event.type) {
            case 'loop-start':
                this.state = {
                    ...this.state,
                    loopState: 'running',
                    iterationCap: event.iterationCap,
                    stopReason: null
                };
                break;
            case 'iteration-start':
                this.state = {
                    ...this.state,
                    loopState: 'running',
                    currentIteration: event.iteration,
                    iterationCap: event.iterationCap,
                    selectedTaskId: event.selectedTaskId,
                    selectedTaskTitle: event.selectedTaskTitle
                };
                break;
            case 'iteration-end':
                this.state = {
                    ...this.state,
                    lastClassification: event.classification,
                    stopReason: event.stopReason
                };
                break;
            case 'loop-end':
                this.state = {
                    ...this.state,
                    loopState: event.stopReason ? 'stopped' : 'idle',
                    stopReason: event.stopReason
                };
                break;
        }
        this.render();
    }
    render() {
        const icon = STATUS_ICONS[this.state.loopState];
        const glyph = STATE_GLYPHS[this.state.loopState];
        switch (this.state.loopState) {
            case 'running': {
                const taskLabel = this.state.selectedTaskId ? ` — ${this.state.selectedTaskId}` : '';
                this.item.text = `${icon} Ralph ${glyph} iter ${this.state.currentIteration}/${this.state.iterationCap}${taskLabel}`;
                break;
            }
            case 'stopped': {
                const reason = this.state.stopReason
                    ? this.state.stopReason.replace(/_/g, ' ')
                    : 'done';
                this.item.text = `${icon} Ralph ${glyph} ${reason}`;
                break;
            }
            default:
                this.item.text = `${icon} Ralph ${glyph} idle`;
        }
        const tooltipLines = ['Ralph Codex Workbench'];
        if (this.state.selectedTaskTitle) {
            tooltipLines.push(`Task: ${this.state.selectedTaskTitle}`);
        }
        if (this.state.lastClassification) {
            tooltipLines.push(`Last: ${this.state.lastClassification}`);
        }
        this.item.tooltip = tooltipLines.join('\n');
    }
    dispose() {
        this.item.dispose();
    }
}
exports.RalphStatusBar = RalphStatusBar;
/** Quick-pick menu shown when clicking the status bar item. */
async function showStatusBarQuickPick() {
    const items = [
        { label: '$(play) Run Loop', description: 'Start the Ralph iteration loop', commandId: 'ralphCodex.runRalphLoop' },
        { label: '$(debug-step-into) Run Iteration', description: 'Run a single CLI iteration', commandId: 'ralphCodex.runRalphIteration' },
        { label: '$(info) Show Status', description: 'Full status report', commandId: 'ralphCodex.showRalphStatus' },
        { label: '$(edit) Prepare Prompt', description: 'Generate the next prompt', commandId: 'ralphCodex.generatePrompt' },
        { label: '$(terminal) Open Codex IDE', description: 'Hand off to Codex IDE', commandId: 'ralphCodex.openCodexAndCopyPrompt' },
        { label: '$(layout-sidebar-left) Dashboard', description: 'Open the Ralph dashboard', commandId: 'ralphCodex.openDashboard' }
    ];
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Ralph Codex — pick an action'
    });
    if (picked) {
        await vscode.commands.executeCommand(picked.commandId);
    }
}
//# sourceMappingURL=statusBarItem.js.map
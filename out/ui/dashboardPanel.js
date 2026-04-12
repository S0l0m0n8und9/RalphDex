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
exports.RalphDashboardPanel = void 0;
const vscode = __importStar(require("vscode"));
const panelHtml_1 = require("./panelHtml");
const dashboardHost_1 = require("../webview/dashboardHost");
/**
 * Editor-area dashboard panel.
 *
 * Lifecycle is managed by {@link WebviewPanelManager} under the name
 * `'dashboard'`. Message handling and state assembly are delegated to
 * {@link DashboardHost} so the sidebar and the panel share one implementation.
 */
class RalphDashboardPanel {
    static viewType = 'ralphCodex.dashboardPanel';
    static currentPanel;
    host;
    constructor(panel, broadcaster, loadSnapshot) {
        this.host = new dashboardHost_1.DashboardHost(panel.webview, broadcaster, panelHtml_1.buildPanelDashboardHtml, loadSnapshot);
        panel.onDidDispose(() => this.dispose());
    }
    /**
     * Creates the dashboard panel via `manager` or reveals the existing one.
     * The `manager` must be the same instance across calls so `createOrReveal`
     * can detect and reveal an already-open panel.
     */
    static createOrReveal(manager, broadcaster, loadSnapshot) {
        const panel = manager.createOrReveal('dashboard', {
            viewType: RalphDashboardPanel.viewType,
            title: 'Ralphdex',
            viewColumn: vscode.ViewColumn.One,
            options: { enableScripts: true, retainContextWhenHidden: true }
        });
        if (RalphDashboardPanel.currentPanel) {
            // Existing panel was just revealed by createOrReveal — nothing more to do.
            return;
        }
        RalphDashboardPanel.currentPanel = new RalphDashboardPanel(panel, broadcaster, loadSnapshot);
    }
    updateFromWatchedState(watched) {
        this.host.updateFromWatchedState(watched);
    }
    /** Forces a fresh snapshot load. No-op if the host has no snapshot loader. */
    refreshSnapshot() {
        void this.host.refreshDashboardSnapshot();
    }
    dispose() {
        RalphDashboardPanel.currentPanel = undefined;
        this.host.dispose();
    }
}
exports.RalphDashboardPanel = RalphDashboardPanel;
//# sourceMappingURL=dashboardPanel.js.map
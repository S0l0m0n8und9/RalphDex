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
exports.WebviewPanelManager = void 0;
const vscode = __importStar(require("vscode"));
// ---------------------------------------------------------------------------
// WebviewPanelManager
// ---------------------------------------------------------------------------
/**
 * Manages named {@link vscode.WebviewPanel} instances.
 *
 * Each panel is identified by a string `name`. Calling
 * {@link createOrReveal} with the same name reveals the existing panel
 * rather than creating a duplicate. Panels are automatically removed from
 * the registry when they are closed by the user or disposed programmatically.
 *
 * Dispose the manager to close all open panels at once.
 */
class WebviewPanelManager {
    factory;
    panels = new Map();
    constructor(factory) {
        this.factory = factory;
    }
    /**
     * Returns the existing panel for `name` (revealing it) or creates a new
     * one using `opts`.
     */
    createOrReveal(name, opts) {
        const existing = this.panels.get(name);
        if (existing) {
            existing.reveal(opts.viewColumn ?? vscode.ViewColumn.One);
            return existing;
        }
        const panel = this.factory.createWebviewPanel(opts.viewType, opts.title, opts.viewColumn ?? vscode.ViewColumn.One, opts.options);
        this.panels.set(name, panel);
        // Clean up the registry entry when VS Code closes the panel.
        panel.onDidDispose(() => {
            this.panels.delete(name);
        });
        return panel;
    }
    /** Returns the panel registered under `name`, or `undefined`. */
    get(name) {
        return this.panels.get(name);
    }
    /** Disposes the panel registered under `name` and removes it from the registry. */
    disposePanel(name) {
        const panel = this.panels.get(name);
        if (panel) {
            this.panels.delete(name);
            panel.dispose();
        }
    }
    /** Disposes all open panels and clears the registry. */
    dispose() {
        for (const panel of this.panels.values()) {
            panel.dispose();
        }
        this.panels.clear();
    }
}
exports.WebviewPanelManager = WebviewPanelManager;
//# sourceMappingURL=WebviewPanelManager.js.map
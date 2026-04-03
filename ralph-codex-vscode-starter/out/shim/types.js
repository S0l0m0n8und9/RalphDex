"use strict";
/**
 * Host abstraction layer for VS Code APIs consumed by the Ralph iteration engine.
 *
 * These interfaces mirror the subset of VS Code API surface that iterationEngine,
 * iterationPreparation, and registerCommands depend on, expressed without any
 * import of the `vscode` module. A concrete VS Code implementation (the real
 * extension host) satisfies these interfaces structurally. A stdout-backed shim
 * (T71.2) will implement them for headless CLI execution.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=types.js.map
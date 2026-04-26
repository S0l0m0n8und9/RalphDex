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
exports.inferStructureDefinition = inferStructureDefinition;
exports.generateStructureDefinition = generateStructureDefinition;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const ROLE_MAP = new Map([
    ['src', 'source'],
    ['source', 'source'],
    ['lib', 'source'],
    ['test', 'test'],
    ['tests', 'test'],
    ['__tests__', 'test'],
    ['spec', 'test'],
    ['specs', 'test'],
    ['docs', 'docs'],
    ['doc', 'docs'],
    ['documentation', 'docs'],
    ['scripts', 'scripts'],
    ['script', 'scripts'],
    ['bin', 'scripts'],
    ['tools', 'scripts'],
    ['.ralph', 'state'],
    ['dist', 'output'],
    ['out', 'output'],
    ['build', 'output'],
    ['output', 'output'],
    ['.next', 'output'],
    ['coverage', 'output'],
    ['assets', 'assets'],
    ['static', 'assets'],
    ['public', 'assets'],
    ['media', 'assets'],
    ['images', 'assets'],
    ['config', 'config'],
    ['.github', 'config'],
    ['.vscode', 'config'],
    ['node_modules', 'other']
]);
const CONFIG_FILE_INDICATORS = [
    'package.json',
    'tsconfig.json',
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.json',
    '.eslintrc.cjs',
    '.prettierrc',
    'jest.config.js',
    'jest.config.ts',
    'vitest.config.ts',
    'webpack.config.js',
    'rollup.config.js',
    '.babelrc',
    'Makefile',
    'pyproject.toml',
    'setup.py',
    'Cargo.toml',
    'go.mod'
];
function inferDirRole(name) {
    return ROLE_MAP.get(name.toLowerCase()) ?? 'other';
}
async function inferStructureDefinition(rootPath) {
    const directories = [];
    let entries;
    try {
        entries = await fs.readdir(rootPath, { withFileTypes: true });
    }
    catch {
        return { version: 1, directories };
    }
    const dirNames = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    const fileNames = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
    for (const name of dirNames) {
        directories.push({
            path: name,
            role: inferDirRole(name),
            description: `Inferred from directory name.`
        });
    }
    const hasConfigFiles = CONFIG_FILE_INDICATORS.some((indicator) => fileNames.has(indicator));
    if (hasConfigFiles) {
        directories.push({
            path: '.',
            role: 'config',
            description: 'Root-level configuration files.'
        });
    }
    return { version: 1, directories };
}
async function generateStructureDefinition(rootPath, outputPath) {
    try {
        await fs.access(outputPath);
        return { written: false, reason: 'File already exists; skipped to avoid overwrite.' };
    }
    catch {
        // file absent — proceed
    }
    const definition = await inferStructureDefinition(rootPath);
    const content = JSON.stringify(definition, null, 2);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf8');
    return { written: true, reason: 'Structure definition inferred and written.' };
}
//# sourceMappingURL=structureInference.js.map
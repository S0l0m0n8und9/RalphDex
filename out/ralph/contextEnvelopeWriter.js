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
exports.writeContextEnvelope = writeContextEnvelope;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("./integrity");
const artifactStore_1 = require("./artifactStore");
async function writeContextEnvelope(input) {
    const iterationId = String(input.iteration);
    const filePath = (0, artifactStore_1.contextEnvelopePath)(input.artifactRootDir, iterationId.padStart(3, '0'));
    const envelope = {
        iterationId,
        agentRole: input.contextEnvelope.agentRole,
        exposedArtifacts: [...input.contextEnvelope.exposedArtifacts].sort(),
        omittedArtifacts: [...input.contextEnvelope.omittedArtifacts].sort((left, right) => left.path.localeCompare(right.path)),
        policySource: input.policySource ?? 'preset'
    };
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, (0, integrity_1.stableJson)(envelope), 'utf8');
    return filePath;
}
//# sourceMappingURL=contextEnvelopeWriter.js.map
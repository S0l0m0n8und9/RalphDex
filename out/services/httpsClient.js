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
exports.setHttpsClientOverride = setHttpsClientOverride;
exports.httpsPost = httpsPost;
const https = __importStar(require("node:https"));
let clientOverride = null;
function setHttpsClientOverride(override) {
    clientOverride = override;
}
async function httpsPost(options) {
    if (clientOverride) {
        return clientOverride(options);
    }
    return new Promise((resolve, reject) => {
        const url = new URL(options.url);
        const bodyBuffer = Buffer.from(options.body, 'utf8');
        const reqOptions = {
            hostname: url.hostname,
            port: url.port ? Number(url.port) : 443,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': bodyBuffer.length,
                ...options.headers
            }
        };
        const req = https.request(reqOptions, (res) => {
            const chunks = [];
            res.on('data', (chunk) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
            });
            res.on('end', () => {
                resolve({
                    responseBody: Buffer.concat(chunks).toString('utf8'),
                    statusCode: res.statusCode ?? 0
                });
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
            req.setTimeout(options.timeoutMs, () => {
                req.destroy(new Error(`HTTPS request timed out after ${options.timeoutMs}ms`));
            });
        }
        req.write(bodyBuffer);
        req.end();
    });
}
//# sourceMappingURL=httpsClient.js.map
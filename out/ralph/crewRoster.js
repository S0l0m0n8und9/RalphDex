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
exports.parseCrewRoster = parseCrewRoster;
const fs = __importStar(require("fs/promises"));
const CREW_MEMBER_ROLES = ['planner', 'implementer', 'reviewer'];
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function validateCrewMember(item, index) {
    if (!isRecord(item)) {
        return { member: null, warning: `crew.json entry[${index}] is not an object; skipping.` };
    }
    const { id, role, goal, backstory } = item;
    if (typeof id !== 'string' || !id.trim()) {
        return { member: null, warning: `crew.json entry[${index}] missing required string field "id"; skipping.` };
    }
    if (!CREW_MEMBER_ROLES.includes(role)) {
        return {
            member: null,
            warning: `crew.json entry[${index}] ("${id}") has invalid role "${String(role)}"; expected one of ${CREW_MEMBER_ROLES.join(', ')}; skipping.`
        };
    }
    const member = { id: id.trim(), role: role };
    if (typeof goal === 'string' && goal.trim()) {
        member.goal = goal.trim();
    }
    if (typeof backstory === 'string' && backstory.trim()) {
        member.backstory = backstory.trim();
    }
    return { member, warning: null };
}
/**
 * Reads and validates .ralph/crew.json.
 *
 * Returns `members: null` when the file does not exist (caller should fall back
 * to agentCount-based synthesis). Returns `members: []` with warnings when the
 * file exists but every entry is invalid. Never throws.
 */
async function parseCrewRoster(crewJsonPath) {
    let raw;
    try {
        raw = await fs.readFile(crewJsonPath, 'utf8');
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            return { members: null, warnings: [] };
        }
        return {
            members: [],
            warnings: [`crew.json could not be read (${err.message}); falling back to agentCount.`]
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return {
            members: [],
            warnings: ['crew.json is not valid JSON; falling back to agentCount.']
        };
    }
    if (!Array.isArray(parsed)) {
        return {
            members: [],
            warnings: ['crew.json must be a JSON array of crew member objects; falling back to agentCount.']
        };
    }
    const warnings = [];
    const members = [];
    for (let i = 0; i < parsed.length; i++) {
        const { member, warning } = validateCrewMember(parsed[i], i);
        if (warning) {
            warnings.push(warning);
        }
        if (member) {
            members.push(member);
        }
    }
    return { members, warnings };
}
//# sourceMappingURL=crewRoster.js.map
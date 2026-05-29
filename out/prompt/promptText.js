"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatOptional = formatOptional;
exports.compactList = compactList;
exports.roleContextProfile = roleContextProfile;
function formatOptional(value) {
    return value && value.trim().length > 0 ? value.trim() : 'none';
}
function compactList(values, limit) {
    if (values.length === 0) {
        return 'none';
    }
    const visible = values.slice(0, limit);
    const remaining = values.length - visible.length;
    return remaining > 0 ? `${visible.join(', ')} (+${remaining} more)` : visible.join(', ');
}
function roleContextProfile(agentRole) {
    switch (agentRole) {
        case 'planner':
            return 'planner';
        case 'review':
        case 'reviewer':
        case 'watchdog':
            return 'reviewer';
        case 'scm':
            return 'scm';
        default:
            return 'implementer';
    }
}
//# sourceMappingURL=promptText.js.map
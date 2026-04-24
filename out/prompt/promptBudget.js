"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLAUDE_PROMPT_BUDGET_POLICIES = exports.CODEX_PROMPT_BUDGET_POLICIES = exports.REQUIRED_PROMPT_SECTIONS = void 0;
exports.buildPromptBudgetPolicy = buildPromptBudgetPolicy;
exports.estimateTokenCount = estimateTokenCount;
exports.estimateTokenRange = estimateTokenRange;
exports.REQUIRED_PROMPT_SECTIONS = [
    'strategyContext',
    'preflightContext',
    'objectiveContext',
    'taskContext',
    'operatingRules',
    'executionContract',
    'finalResponseContract'
];
exports.CODEX_PROMPT_BUDGET_POLICIES = {
    'bootstrap:cliExec': {
        name: 'bootstrap:cliExec',
        targetTokens: 2100,
        minimumContextBias: 'broad objective, expanded repo scan, standard runtime pointers',
        objectiveLines: 12,
        objectiveChars: 1400,
        progressLines: 6,
        progressChars: 640,
        priorBudget: 4,
        repoDetail: 'expanded',
        runtimeDetail: 'standard',
        requiredSections: exports.REQUIRED_PROMPT_SECTIONS,
        optionalSectionOrder: ['priorIterationContext']
    },
    'bootstrap:ideHandoff': {
        name: 'bootstrap:ideHandoff',
        targetTokens: 1500,
        minimumContextBias: 'broad objective, lighter runtime and repo detail for human review',
        objectiveLines: 10,
        objectiveChars: 1000,
        progressLines: 4,
        progressChars: 320,
        priorBudget: 3,
        repoDetail: 'standard',
        runtimeDetail: 'minimal',
        requiredSections: exports.REQUIRED_PROMPT_SECTIONS,
        optionalSectionOrder: ['runtimeContext', 'repoContext', 'progressContext', 'priorIterationContext']
    },
    'iteration:cliExec': {
        name: 'iteration:cliExec',
        targetTokens: 1600,
        minimumContextBias: 'selected task plus compact repo/runtime context',
        objectiveLines: 9,
        objectiveChars: 960,
        progressLines: 5,
        progressChars: 420,
        priorBudget: 6,
        repoDetail: 'minimal',
        runtimeDetail: 'minimal',
        requiredSections: exports.REQUIRED_PROMPT_SECTIONS,
        optionalSectionOrder: ['runtimeContext', 'repoContext', 'progressContext', 'priorIterationContext']
    },
    'iteration:ideHandoff': {
        name: 'iteration:ideHandoff',
        targetTokens: 1000,
        minimumContextBias: 'selected task plus compact review-oriented context',
        objectiveLines: 8,
        objectiveChars: 720,
        progressLines: 4,
        progressChars: 300,
        priorBudget: 4,
        repoDetail: 'minimal',
        runtimeDetail: 'minimal',
        requiredSections: exports.REQUIRED_PROMPT_SECTIONS,
        optionalSectionOrder: ['runtimeContext', 'repoContext', 'priorIterationContext', 'progressContext']
    },
    'replenish-backlog:cliExec': {
        name: 'replenish-backlog:cliExec',
        targetTokens: 1800,
        minimumContextBias: 'PRD, backlog counts, and expanded repo/runtime context for task generation',
        objectiveLines: 10,
        objectiveChars: 1100,
        progressLines: 6,
        progressChars: 560,
        priorBudget: 4,
        repoDetail: 'expanded',
        runtimeDetail: 'standard',
        requiredSections: exports.REQUIRED_PROMPT_SECTIONS,
        optionalSectionOrder: ['priorIterationContext']
    },
    'replenish-backlog:ideHandoff': {
        name: 'replenish-backlog:ideHandoff',
        targetTokens: 1300,
        minimumContextBias: 'PRD, backlog counts, and explicit next-task generation context',
        objectiveLines: 9,
        objectiveChars: 900,
        progressLines: 5,
        progressChars: 420,
        priorBudget: 4,
        repoDetail: 'expanded',
        runtimeDetail: 'standard',
        requiredSections: exports.REQUIRED_PROMPT_SECTIONS,
        optionalSectionOrder: ['priorIterationContext']
    },
    'fix-failure:cliExec': {
        name: 'fix-failure:cliExec',
        targetTokens: 1700,
        minimumContextBias: 'failure signature, blocker, remediation, validation context',
        objectiveLines: 9,
        objectiveChars: 900,
        progressLines: 5,
        progressChars: 420,
        priorBudget: 6,
        repoDetail: 'standard',
        runtimeDetail: 'minimal',
        requiredSections: exports.REQUIRED_PROMPT_SECTIONS,
        optionalSectionOrder: ['runtimeContext', 'repoContext', 'progressContext']
    },
    'fix-failure:ideHandoff': {
        name: 'fix-failure:ideHandoff',
        targetTokens: 1100,
        minimumContextBias: 'failure signature and blocker summary for manual inspection',
        objectiveLines: 8,
        objectiveChars: 760,
        progressLines: 4,
        progressChars: 320,
        priorBudget: 6,
        repoDetail: 'minimal',
        runtimeDetail: 'minimal',
        requiredSections: exports.REQUIRED_PROMPT_SECTIONS,
        optionalSectionOrder: ['runtimeContext', 'repoContext', 'progressContext']
    },
    'continue-progress:cliExec': {
        name: 'continue-progress:cliExec',
        targetTokens: 1600,
        minimumContextBias: 'selected task plus compact recent progress and prior iteration state',
        objectiveLines: 9,
        objectiveChars: 960,
        progressLines: 5,
        progressChars: 420,
        priorBudget: 5,
        repoDetail: 'minimal',
        runtimeDetail: 'minimal',
        requiredSections: exports.REQUIRED_PROMPT_SECTIONS,
        optionalSectionOrder: ['runtimeContext', 'repoContext', 'progressContext', 'priorIterationContext']
    },
    'continue-progress:ideHandoff': {
        name: 'continue-progress:ideHandoff',
        targetTokens: 1000,
        minimumContextBias: 'selected task plus compact carry-forward state for human review',
        objectiveLines: 8,
        objectiveChars: 720,
        progressLines: 4,
        progressChars: 300,
        priorBudget: 4,
        repoDetail: 'minimal',
        runtimeDetail: 'minimal',
        requiredSections: exports.REQUIRED_PROMPT_SECTIONS,
        optionalSectionOrder: ['runtimeContext', 'repoContext', 'priorIterationContext', 'progressContext']
    },
    'human-review-handoff:cliExec': {
        name: 'human-review-handoff:cliExec',
        targetTokens: 1500,
        minimumContextBias: 'blocker, remediation, and current task state over broad history',
        objectiveLines: 8,
        objectiveChars: 820,
        progressLines: 4,
        progressChars: 320,
        priorBudget: 6,
        repoDetail: 'minimal',
        runtimeDetail: 'minimal',
        requiredSections: exports.REQUIRED_PROMPT_SECTIONS,
        optionalSectionOrder: ['runtimeContext', 'repoContext', 'progressContext']
    },
    'human-review-handoff:ideHandoff': {
        name: 'human-review-handoff:ideHandoff',
        targetTokens: 1100,
        minimumContextBias: 'blocker and review decision points over broad history',
        objectiveLines: 8,
        objectiveChars: 760,
        progressLines: 4,
        progressChars: 320,
        priorBudget: 6,
        repoDetail: 'minimal',
        runtimeDetail: 'minimal',
        requiredSections: exports.REQUIRED_PROMPT_SECTIONS,
        optionalSectionOrder: ['runtimeContext', 'repoContext', 'progressContext']
    }
};
exports.CLAUDE_PROMPT_BUDGET_POLICIES = {
    'bootstrap:cliExec': {
        ...exports.CODEX_PROMPT_BUDGET_POLICIES['bootstrap:cliExec'],
        name: 'claude/bootstrap:cliExec',
        targetTokens: 3200,
        minimumContextBias: 'Claude profile: broader objective, expanded repo scan, standard runtime pointers'
    },
    'bootstrap:ideHandoff': {
        ...exports.CODEX_PROMPT_BUDGET_POLICIES['bootstrap:ideHandoff'],
        name: 'claude/bootstrap:ideHandoff',
        targetTokens: 2200,
        minimumContextBias: 'Claude profile: broader objective with lighter runtime and repo detail for human review'
    },
    'iteration:cliExec': {
        ...exports.CODEX_PROMPT_BUDGET_POLICIES['iteration:cliExec'],
        name: 'claude/iteration:cliExec',
        targetTokens: 2400,
        minimumContextBias: 'Claude profile: selected task plus richer repo/runtime context'
    },
    'iteration:ideHandoff': {
        ...exports.CODEX_PROMPT_BUDGET_POLICIES['iteration:ideHandoff'],
        name: 'claude/iteration:ideHandoff',
        targetTokens: 1500,
        minimumContextBias: 'Claude profile: selected task plus richer review-oriented context'
    },
    'replenish-backlog:cliExec': {
        ...exports.CODEX_PROMPT_BUDGET_POLICIES['replenish-backlog:cliExec'],
        name: 'claude/replenish-backlog:cliExec',
        targetTokens: 2800,
        minimumContextBias: 'Claude profile: PRD, backlog counts, and richer repo/runtime context for task generation'
    },
    'replenish-backlog:ideHandoff': {
        ...exports.CODEX_PROMPT_BUDGET_POLICIES['replenish-backlog:ideHandoff'],
        name: 'claude/replenish-backlog:ideHandoff',
        targetTokens: 1900,
        minimumContextBias: 'Claude profile: PRD, backlog counts, and explicit next-task generation context'
    },
    'fix-failure:cliExec': {
        ...exports.CODEX_PROMPT_BUDGET_POLICIES['fix-failure:cliExec'],
        name: 'claude/fix-failure:cliExec',
        targetTokens: 2500,
        minimumContextBias: 'Claude profile: failure signature, blocker, remediation, and fuller validation context'
    },
    'fix-failure:ideHandoff': {
        ...exports.CODEX_PROMPT_BUDGET_POLICIES['fix-failure:ideHandoff'],
        name: 'claude/fix-failure:ideHandoff',
        targetTokens: 1700,
        minimumContextBias: 'Claude profile: failure signature and blocker summary for manual inspection'
    },
    'continue-progress:cliExec': {
        ...exports.CODEX_PROMPT_BUDGET_POLICIES['continue-progress:cliExec'],
        name: 'claude/continue-progress:cliExec',
        targetTokens: 2400,
        minimumContextBias: 'Claude profile: selected task plus richer recent progress and prior iteration state'
    },
    'continue-progress:ideHandoff': {
        ...exports.CODEX_PROMPT_BUDGET_POLICIES['continue-progress:ideHandoff'],
        name: 'claude/continue-progress:ideHandoff',
        targetTokens: 1500,
        minimumContextBias: 'Claude profile: selected task plus richer carry-forward state for human review'
    },
    'human-review-handoff:cliExec': {
        ...exports.CODEX_PROMPT_BUDGET_POLICIES['human-review-handoff:cliExec'],
        name: 'claude/human-review-handoff:cliExec',
        targetTokens: 2300,
        minimumContextBias: 'Claude profile: blocker, remediation, and current task state over broader history'
    },
    'human-review-handoff:ideHandoff': {
        ...exports.CODEX_PROMPT_BUDGET_POLICIES['human-review-handoff:ideHandoff'],
        name: 'claude/human-review-handoff:ideHandoff',
        targetTokens: 1700,
        minimumContextBias: 'Claude profile: blocker and review decision points over broader history'
    }
};
function buildPromptBudgetPolicy(kind, target, profile = 'codex', customPromptBudget = {}) {
    const key = `${kind}:${target}`;
    const codexFallback = exports.CODEX_PROMPT_BUDGET_POLICIES['iteration:cliExec'];
    const codexPolicy = exports.CODEX_PROMPT_BUDGET_POLICIES[key] ?? codexFallback;
    if (profile === 'claude') {
        return exports.CLAUDE_PROMPT_BUDGET_POLICIES[key]
            ?? exports.CLAUDE_PROMPT_BUDGET_POLICIES['iteration:cliExec'];
    }
    if (profile === 'custom') {
        const overriddenTarget = customPromptBudget[key];
        return {
            ...codexPolicy,
            name: `custom/${key}`,
            targetTokens: typeof overriddenTarget === 'number' && Number.isFinite(overriddenTarget) && overriddenTarget > 0
                ? Math.floor(overriddenTarget)
                : codexPolicy.targetTokens,
            minimumContextBias: typeof overriddenTarget === 'number' && Number.isFinite(overriddenTarget) && overriddenTarget > 0
                ? `${codexPolicy.minimumContextBias}; custom targetTokens override`
                : `${codexPolicy.minimumContextBias}; custom profile using codex fallback target`
        };
    }
    return codexPolicy;
}
function estimateTokenCount(text) {
    return Math.max(1, Math.ceil(Buffer.byteLength(text, 'utf8') / 4));
}
function estimateTokenRange(estimatedTokens) {
    const spread = Math.max(16, Math.ceil(estimatedTokens * 0.12));
    return {
        min: Math.max(1, estimatedTokens - spread),
        max: estimatedTokens + spread
    };
}
//# sourceMappingURL=promptBudget.js.map
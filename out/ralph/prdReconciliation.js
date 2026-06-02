"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRD_RECONCILIATION_SCHEMA_VERSION = void 0;
exports.parsePrdTaskReferences = parsePrdTaskReferences;
exports.significantTitleTokens = significantTitleTokens;
exports.analyzePrdBacklogReconciliation = analyzePrdBacklogReconciliation;
exports.renderPrdReconciliationMarkdown = renderPrdReconciliationMarkdown;
/**
 * PRD ↔ backlog reconciliation (issue #71).
 *
 * Long-lived workspaces drift between `.ralph/prd.md` (the product objective and
 * scope authority) and `.ralph/tasks.json` (the executable backlog). This module
 * detects that drift and produces a **reviewable proposal artifact** — it never
 * mutates `tasks.json`. The checks are deliberately conservative so a healthy
 * workspace produces zero findings; drift surfaces only on real signals.
 *
 * Checks:
 * - `stale_prd_task_reference`: the PRD cites a task id that no longer exists in
 *   the backlog (the PRD describes work the backlog has dropped).
 * - `orphan_active_task`: an active (todo/in_progress) task that is neither cited
 *   by id in the live PRD scope nor shares a significant title token with live
 *   PRD scope text (backlog work the current PRD does not describe).
 * - `duplicate_active_task`: two or more active tasks with the same normalized
 *   title (redundant backlog coverage).
 *
 * A deliberately-omitted check is "PRD cites a done task as active": the PRD
 * routinely acknowledges closed tasks in its live scope (e.g. "T225 is closed"),
 * so flagging every done id cited in live scope produces false positives. That
 * needs prose understanding the deterministic engine does not attempt.
 */
exports.PRD_RECONCILIATION_SCHEMA_VERSION = 1;
const TASK_ID_PATTERN = /\bT\d+(?:\.\d+)*\b/g;
/** Active = not yet terminal; the only statuses a reconciliation should police. */
function isActiveStatus(status) {
    return status === 'todo' || status === 'in_progress';
}
/**
 * Extracts task-id references from the PRD, split into all references and those
 * inside the *live scope* region. The live region is the content under a
 * `## Current scope` heading up to the next `## ` heading (by convention the
 * `## Delivered horizons (archive)` marker) — so archived horizons that cite
 * long-completed task ids do not drive active-backlog reconciliation.
 */
function parsePrdTaskReferences(prdText) {
    const allIds = new Set(prdText.match(TASK_ID_PATTERN) ?? []);
    const lines = prdText.split('\n');
    const liveLines = [];
    let inLiveScope = false;
    for (const line of lines) {
        const isH2 = /^##\s+/.test(line);
        if (isH2) {
            // Enter on a "Current scope" / "Live ..." H2; leave on the next H2.
            inLiveScope = /current scope|live (view|backlog)/i.test(line);
            continue;
        }
        if (inLiveScope) {
            liveLines.push(line);
        }
    }
    const liveScopeText = liveLines.join('\n');
    const liveScopeIds = new Set(liveScopeText.match(TASK_ID_PATTERN) ?? []);
    return { allIds, liveScopeIds, liveScopeText };
}
const TITLE_STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'into', 'from', 'that', 'this', 'add', 'use', 'via',
    'when', 'then', 'than', 'task', 'tasks', 'ralph', 'ralphdex'
]);
/** Significant lower-cased title tokens (alphabetic, length ≥ 4, non-stopword). */
function significantTitleTokens(title) {
    return Array.from(new Set(title
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4 && /[a-z]/.test(token) && !TITLE_STOPWORDS.has(token))));
}
function normalizeTitle(title) {
    return title.trim().toLowerCase().replace(/\s+/g, ' ');
}
/**
 * Analyses PRD ↔ backlog drift and returns a proposal. Pure: no disk access, no
 * task mutation.
 */
function analyzePrdBacklogReconciliation(input) {
    const findings = [];
    const tasks = input.taskFile.tasks ?? [];
    const taskIds = new Set(tasks.map((task) => task.id));
    const { liveScopeIds, liveScopeText } = parsePrdTaskReferences(input.prdText);
    const liveScopeTextLower = liveScopeText.toLowerCase();
    // stale_prd_task_reference: the PRD's *live scope* cites an id the backlog no
    // longer contains. Scope to liveScopeIds (not allIds) so completed tasks that
    // were pruned from tasks.json but are still cited in the archived-horizon
    // sections do not produce false positives.
    const staleRefs = Array.from(liveScopeIds).filter((id) => !taskIds.has(id)).sort();
    for (const id of staleRefs) {
        findings.push({
            type: 'stale_prd_task_reference',
            severity: 'warning',
            message: `PRD references task ${id}, which is absent from the backlog. Reconcile the PRD reference or restore the task.`,
            taskIds: [id]
        });
    }
    // orphan_active_task: active task not traceable to the PRD.
    for (const task of tasks) {
        if (!isActiveStatus(task.status)) {
            continue;
        }
        if (liveScopeIds.has(task.id)) {
            continue;
        }
        const tokens = significantTitleTokens(task.title ?? '');
        const traceable = tokens.some((token) => liveScopeTextLower.includes(token));
        if (!traceable) {
            findings.push({
                type: 'orphan_active_task',
                severity: 'info',
                message: `Active task ${task.id} ("${task.title}") is not traceable to any PRD scope. Add it to the PRD or confirm it is still in scope.`,
                taskIds: [task.id]
            });
        }
    }
    // duplicate_active_task: active tasks sharing a normalized title.
    const activeByTitle = new Map();
    for (const task of tasks) {
        if (!isActiveStatus(task.status)) {
            continue;
        }
        const key = normalizeTitle(task.title ?? '');
        if (!key) {
            continue;
        }
        activeByTitle.set(key, [...(activeByTitle.get(key) ?? []), task.id]);
    }
    for (const [, ids] of activeByTitle) {
        if (ids.length > 1) {
            findings.push({
                type: 'duplicate_active_task',
                severity: 'warning',
                message: `Active tasks ${ids.join(', ')} share the same title — likely duplicate backlog coverage.`,
                taskIds: ids
            });
        }
    }
    return {
        schemaVersion: exports.PRD_RECONCILIATION_SCHEMA_VERSION,
        kind: 'prdReconciliation',
        generatedAt: input.generatedAt,
        findingCount: findings.length,
        findings
    };
}
/** Renders a human-readable summary of a reconciliation proposal. */
function renderPrdReconciliationMarkdown(proposal) {
    const lines = [
        '# PRD / backlog reconciliation',
        '',
        `- Generated: ${proposal.generatedAt}`,
        `- Findings: ${proposal.findingCount}`,
        ''
    ];
    if (proposal.findings.length === 0) {
        lines.push('No drift detected between `.ralph/prd.md` and `.ralph/tasks.json`.');
        return lines.join('\n');
    }
    lines.push('This is a review-only proposal. Ralph does not mutate `tasks.json` from PRD drift.', '');
    for (const finding of proposal.findings) {
        lines.push(`- **${finding.severity}** [${finding.type}]: ${finding.message}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=prdReconciliation.js.map
#!/usr/bin/env node
/**
 * scripts/calibrate-tiering.js
 *
 * Re-implements the five scoring signals from src/ralph/complexityScorer.ts in
 * plain Node.js (no build step required) and scores every done task in
 * .ralph/tasks.json.  Prints a tier-distribution table, a score histogram, and
 * representative task examples per tier.
 *
 * Usage: node scripts/calibrate-tiering.js
 *
 * NOTE: trailing_complex_classifications is always 0 here because tasks.json
 * does not persist iteration history.  All scores are therefore lower-bound
 * estimates — real runtime scores can be higher for repeatedly-failing tasks.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ─── Load data ───────────────────────────────────────────────────────────────

const tasksPath = path.join(__dirname, '..', '.ralph', 'tasks.json');
const taskFile = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));

// ─── Default thresholds (mirrors src/config/defaults.ts) ─────────────────────

const SIMPLE_THRESHOLD = 2;
const COMPLEX_THRESHOLD = 6;

// ─── Signal implementations (mirrors complexityScorer.ts exactly) ────────────

function childTaskCount(allTasks, taskId) {
  return allTasks.filter((t) => t.parentId === taskId).length;
}

function titleWordCountContribution(title) {
  const wordCount = title.trim() ? title.trim().split(/\s+/).length : 0;
  if (wordCount >= 13) return 1;
  if (wordCount > 0 && wordCount <= 2) return -1;
  return 0;
}

// trailing_complex_classifications is always 0 — iteration history is not
// persisted in tasks.json.
function trailingComplexClassificationCount() {
  return 0;
}

function scoreTask(task, allTasks) {
  const signals = [];

  // +2 if the task declares a validation command
  if (task.validation && task.validation.trim()) {
    signals.push({ name: 'has_validation_field', contribution: 2 });
  }

  // +1 per child task (capped at 3)
  const childCount = Math.min(childTaskCount(allTasks, task.id), 3);
  if (childCount > 0) {
    signals.push({ name: 'child_task_count', contribution: childCount });
  }

  // +1 if the task includes a blocker note
  if (task.blocker && task.blocker.trim()) {
    signals.push({ name: 'has_blocker_note', contribution: 1 });
  }

  // +1 per trailing complex classification (always 0 — no history in tasks.json)
  const trailingFails = trailingComplexClassificationCount();
  if (trailingFails > 0) {
    signals.push({ name: 'trailing_complex_classifications', contribution: Math.min(trailingFails, 4) });
  }

  // Title breadth, capped to ±1
  const titleContribution = titleWordCountContribution(task.title);
  if (titleContribution !== 0) {
    signals.push({ name: 'title_word_count', contribution: titleContribution });
  }

  const score = signals.reduce((acc, s) => acc + s.contribution, 0);
  return { score, signals };
}

function classifyTier(score) {
  if (score < SIMPLE_THRESHOLD) return 'simple';
  if (score >= COMPLEX_THRESHOLD) return 'complex';
  return 'medium';
}

// ─── Score all done tasks ─────────────────────────────────────────────────────

const allTasks = taskFile.tasks;
const doneTasks = allTasks.filter((t) => t.status === 'done');

const results = doneTasks.map((task) => {
  const { score, signals } = scoreTask(task, allTasks);
  const tier = classifyTier(score);
  return { task, score, signals, tier };
});

// ─── Tier distribution ────────────────────────────────────────────────────────

const tierCounts = { simple: 0, medium: 0, complex: 0 };
for (const r of results) tierCounts[r.tier]++;

const total = results.length;

console.log('');
console.log('=== Model Tiering Calibration ===');
console.log(`Corpus date:  ${new Date().toISOString().slice(0, 10)}`);
console.log(`Done tasks:   ${total}`);
console.log(`Thresholds:   simpleThreshold=${SIMPLE_THRESHOLD}, complexThreshold=${COMPLEX_THRESHOLD}`);
console.log('');
console.log('--- Tier Distribution ---');
console.log(`simple:  ${tierCounts.simple.toString().padStart(4)} tasks  (${((tierCounts.simple / total) * 100).toFixed(1)}%)`);
console.log(`medium:  ${tierCounts.medium.toString().padStart(4)} tasks  (${((tierCounts.medium / total) * 100).toFixed(1)}%)`);
console.log(`complex: ${tierCounts.complex.toString().padStart(4)} tasks  (${((tierCounts.complex / total) * 100).toFixed(1)}%)`);

// ─── Score histogram ──────────────────────────────────────────────────────────

const histogram = {};
for (const r of results) {
  histogram[r.score] = (histogram[r.score] || 0) + 1;
}

console.log('');
console.log('--- Score Histogram ---');
const scores = Object.keys(histogram).map(Number).sort((a, b) => a - b);
for (const s of scores) {
  const count = histogram[s];
  const bar = '█'.repeat(Math.round((count / total) * 40));
  const tier = classifyTier(s);
  console.log(`  score ${s.toString().padStart(2)} [${tier.padEnd(7)}]  ${count.toString().padStart(4)}  ${bar}`);
}

// ─── Representative examples per tier (top 3 by score, then alphabetical) ────

console.log('');
console.log('--- Representative Examples Per Tier ---');

for (const tier of ['simple', 'medium', 'complex']) {
  const tierResults = results.filter((r) => r.tier === tier);
  // Sort: highest score first, then by id for stability
  tierResults.sort((a, b) => b.score - a.score || a.task.id.localeCompare(b.task.id, undefined, { numeric: true }));
  const examples = tierResults.slice(0, 3);

  console.log('');
  console.log(`  ${tier.toUpperCase()} tier (${tierResults.length} tasks):`);
  for (const ex of examples) {
    const signalStr = ex.signals.length ? ex.signals.map((s) => `${s.name}(+${s.contribution})`).join(', ') : 'none';
    console.log(`    ${ex.task.id}: score=${ex.score}  "${ex.task.title}"`);
    console.log(`         signals: ${signalStr}`);
  }
}

// ─── Threshold assessment ──────────────────────────────────────────────────────

console.log('');
console.log('--- Threshold Assessment ---');
const simplePct = (tierCounts.simple / total) * 100;
const mediumPct = (tierCounts.medium / total) * 100;
const complexPct = (tierCounts.complex / total) * 100;

if (simplePct >= 30 && mediumPct >= 30 && complexPct <= 20) {
  console.log('Distribution looks healthy: most tasks land in simple/medium with complex tasks as a minority.');
} else if (simplePct > 70) {
  console.log('WARNING: Over 70% of tasks are simple — consider lowering simpleThreshold to 1.');
} else if (complexPct > 30) {
  console.log('WARNING: Over 30% of tasks are complex — thresholds may be too low; consider raising complexThreshold.');
} else {
  console.log(`Current distribution: simple=${simplePct.toFixed(1)}%, medium=${mediumPct.toFixed(1)}%, complex=${complexPct.toFixed(1)}%.`);
  console.log('Review the histogram above to decide whether threshold adjustment is warranted.');
}

console.log('');
console.log('NOTE: trailing_complex_classifications is 0 for all tasks because iteration');
console.log('history is not persisted in tasks.json.  Actual runtime scores for repeatedly-');
console.log('failing tasks would be higher, pushing more tasks into medium/complex tiers.');

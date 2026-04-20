// Demo data — a realistic mid-loop Ralph workspace
const RALPH_DATA = {
  workspace: 'acme-delivery',
  loopState: 'running', // idle | running | stopped
  iteration: { current: 7, cap: 12 },
  currentTask: { id: 'T-4127', title: 'Add retry backoff to payment webhook handler' },
  provider: 'claude',
  model: 'claude-sonnet-4-6',
  agentRole: 'implementer',

  // Overall task counts
  counts: { todo: 9, in_progress: 2, blocked: 1, done: 14, dead_letter: 1 },

  // Task graph (hierarchical)
  tasks: [
    { id: 'T-4100', title: 'Harden payment webhook reliability', status: 'in_progress', priority: 'high',
      notes: 'Epic — tracks retry, idempotency, and dead-letter handling for Stripe webhooks.',
      depends: [], children: ['T-4127','T-4131','T-4141'] },
    { id: 'T-4127', title: 'Add retry backoff to payment webhook handler', status: 'in_progress', priority: 'high',
      notes: 'Exponential backoff with jitter; max 5 attempts before dead-letter.',
      validation: 'npm test -- webhooks', depends: ['T-4119'], children: [], parent: 'T-4100', current: true },
    { id: 'T-4131', title: 'Persist webhook idempotency keys in Redis', status: 'blocked', priority: 'high',
      blocker: 'Waiting on ops to provision Redis instance in staging.',
      depends: ['T-4127'], children: [], parent: 'T-4100' },
    { id: 'T-4141', title: 'Route un-recoverable webhooks to SQS dead-letter', status: 'todo', priority: 'medium',
      depends: ['T-4131'], children: [], parent: 'T-4100' },
    { id: 'T-4119', title: 'Rewrite webhook parser with zod schemas', status: 'done', priority: 'high', depends: [], children: [] },
    { id: 'T-4120', title: 'Move Stripe secrets to 1Password connect', status: 'done', priority: 'medium', depends: [], children: [] },
    { id: 'T-4156', title: 'Draft on-call runbook for webhook failures', status: 'todo', priority: 'low', depends: ['T-4141'], children: [] },
  ],

  // Multi-agent lanes
  agents: [
    { id: 'impl-01', role: 'implementer', phase: 'execute', iteration: 7, task: 'T-4127', model: 'sonnet-4-6', stuck: false, throughput: 6 },
    { id: 'review-01', role: 'reviewer', phase: 'verify', iteration: 6, task: 'T-4119', model: 'haiku-4-5', stuck: false, throughput: 11 },
    { id: 'watchdog', role: 'watchdog', phase: 'inspect', iteration: 3, task: null, model: 'haiku-4-5', stuck: false, throughput: 3 },
    { id: 'scm-01', role: 'scm', phase: 'persist', iteration: 2, task: 'T-4120', model: 'haiku-4-5', stuck: false, throughput: 2 },
  ],

  // Iteration history (most recent first)
  history: [
    { n: 7, task: 'T-4127', agent: 'impl-01', classification: 'partial_progress', duration: '2m 14s', cost: 0.28 },
    { n: 6, task: 'T-4127', agent: 'impl-01', classification: 'no_progress',      duration: '1m 48s', cost: 0.22 },
    { n: 5, task: 'T-4127', agent: 'impl-01', classification: 'failed',           duration: '3m 02s', cost: 0.41, stop: 'validation_failed' },
    { n: 4, task: 'T-4119', agent: 'impl-01', classification: 'complete',         duration: '4m 17s', cost: 0.58 },
    { n: 3, task: 'T-4119', agent: 'impl-01', classification: 'partial_progress', duration: '2m 55s', cost: 0.33 },
    { n: 2, task: 'T-4120', agent: 'impl-01', classification: 'complete',         duration: '1m 22s', cost: 0.12 },
    { n: 1, task: 'T-4120', agent: 'impl-01', classification: 'partial_progress', duration: '1m 10s', cost: 0.09 },
  ],

  // Most pressing failure
  failure: {
    taskId: 'T-4127',
    taskTitle: 'Add retry backoff to payment webhook handler',
    category: 'validation_failed',
    confidence: 'high',
    attempts: 2,
    summary: 'Validator "npm test -- webhooks" failed on 3 cases. Retry timer units are still milliseconds but the Stripe SDK expects seconds for the Retry-After header.',
    suggestedAction: 'Update applyBackoff() to convert delay to seconds before setting the Retry-After header. Add a unit for units in the helper signature to prevent drift.',
    humanReview: false,
  },

  // Dead letter
  deadLetter: [
    { taskId: 'T-3998', title: 'Migrate analytics events to Snowpipe streaming', attempts: 3, lastCategory: 'external_dependency_failure' },
  ],

  // Cost
  cost: { loop: 3.17, today: 14.82, diagnostic: 0.06 },

  // Pipelines — named sequences of tasks/goals with lifecycle state.
  pipelines: [
    {
      id: 'pl-webhooks', name: 'Harden payment webhooks', emoji: '🛡',
      state: 'running', preset: 'Standard', autonomy: 'autonomous',
      progress: { done: 2, total: 5 },
      concurrency: 1, budgetUsd: 5.00, spentUsd: 3.17, iterCap: 12, iterUsed: 7,
      started: 'today · 10:42', eta: '~18 min',
      goal: 'Webhook handler survives transient failures: retries, idempotency, DLQ.',
      tasks: [
        { id:'T-4119', title:'Rewrite webhook parser with zod schemas', status:'done' },
        { id:'T-4120', title:'Move Stripe secrets to 1Password connect', status:'done' },
        { id:'T-4127', title:'Add retry backoff to payment webhook handler', status:'in_progress' },
        { id:'T-4131', title:'Persist webhook idempotency keys in Redis', status:'blocked' },
        { id:'T-4141', title:'Route un-recoverable webhooks to SQS dead-letter', status:'todo' },
      ],
    },
    {
      id: 'pl-onboarding', name: 'Customer onboarding v2', emoji: '🚀',
      state: 'paused', preset: 'Multi-Agent', autonomy: 'supervised',
      progress: { done: 3, total: 8 },
      concurrency: 3, budgetUsd: 12.00, spentUsd: 4.44, iterCap: 24, iterUsed: 9,
      started: 'yesterday · 16:10', eta: 'paused · 1h ago',
      goal: 'New 3-step signup + Segment events + welcome email.',
      tasks: [
        { id:'T-4080', title:'Scaffold onboarding route + feature flag', status:'done' },
        { id:'T-4083', title:'Build step 1: workspace name + slug', status:'done' },
        { id:'T-4085', title:'Build step 2: invite teammates', status:'done' },
        { id:'T-4089', title:'Build step 3: pick starter template', status:'in_progress' },
        { id:'T-4092', title:'Wire Segment `onboarding_completed`', status:'todo' },
      ],
    },
    {
      id: 'pl-flaky', name: 'Kill flaky tests', emoji: '🧪',
      state: 'queued', preset: 'Hardcore', autonomy: 'autonomous',
      progress: { done: 0, total: 12 },
      concurrency: 4, budgetUsd: 20.00, spentUsd: 0, iterCap: 30, iterUsed: 0,
      started: '—', eta: 'queued after webhooks',
      goal: 'Quarantine, diagnose, and fix the 12 tests flagged flaky in CI.',
      tasks: [],
    },
    {
      id: 'pl-legacy', name: 'Retire legacy billing endpoints', emoji: '📦',
      state: 'done', preset: 'Standard', autonomy: 'autonomous',
      progress: { done: 6, total: 6 },
      concurrency: 1, budgetUsd: 6.00, spentUsd: 2.91, iterCap: 20, iterUsed: 14,
      started: 'Fri · 09:14', eta: 'completed Fri 15:02',
      goal: 'Remove deprecated /v1 billing routes; migrate consumers to /v2.',
      tasks: [],
    },
  ],

  // Orchestration policy (Advanced only)
  policy: {
    concurrency: 4,
    costCap: { hard: 25.00, soft: 20.00 },
    iterCap: 12,
    humanGate: 'on-failure', // off | on-failure | always
    modelRouting: [
      { when: 'planning', model: 'claude-sonnet-4-6', effort: 'high' },
      { when: 'implement', model: 'claude-sonnet-4-6', effort: 'medium' },
      { when: 'review', model: 'claude-haiku-4-5', effort: 'low' },
      { when: 'watchdog', model: 'claude-haiku-4-5', effort: 'low' },
    ],
    rules: [
      { label: 'Halt pipeline if 3 failures within 10 iterations', enabled: true },
      { label: 'Require human review before merge on production paths', enabled: true },
      { label: 'Downgrade to haiku after 2 no-progress iterations', enabled: false },
      { label: 'Commit on every complete iteration', enabled: true },
    ],
  },

  // Raw iteration log (Advanced only) — deeper than the friendly Timeline
  rawLog: [
    { ts:'14:03:52', lvl:'info',  agent:'impl-01', iter:7, msg:'invoke claude-sonnet-4-6 · effort=medium · 8241 tok in' },
    { ts:'14:05:48', lvl:'info',  agent:'impl-01', iter:7, msg:'tool(write_file) src/webhooks/retry.ts · +42 / -11' },
    { ts:'14:05:51', lvl:'info',  agent:'impl-01', iter:7, msg:'validator npm test -- webhooks → exit 1 (3 failed)' },
    { ts:'14:05:52', lvl:'warn',  agent:'impl-01', iter:7, msg:'classify(partial_progress) · tests regressed' },
    { ts:'14:06:04', lvl:'info',  agent:'review-01', iter:6, msg:'review ok · 1 suggestion on naming' },
    { ts:'14:06:20', lvl:'info',  agent:'watchdog', iter:3, msg:'no loop detected · 7 iterations within threshold' },
    { ts:'14:06:42', lvl:'error', agent:'impl-01', iter:5, msg:'validator failed · Retry-After unit mismatch (ms vs s)' },
    { ts:'14:07:10', lvl:'info',  agent:'scm-01', iter:2, msg:'checkpoint snapshot + diff persisted → .ralph/iter/2' },
  ],

  // Diagnostics (preflight + warnings)
  diagnostics: [
    { severity: 'ok', message: 'Git working tree clean · branch main' },
    { severity: 'ok', message: '.ralph/tasks.json validated (v2 contract)' },
    { severity: 'warn', message: 'No validation command inferred — fallback: npm test' },
    { severity: 'info', message: 'Prompt budget 63% · 8.2k / 13k tokens' },
  ],
};

window.RALPH_DATA = RALPH_DATA;

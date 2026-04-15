import assert from 'node:assert/strict';
import * as path from 'node:path';
import test from 'node:test';
import { DEFAULT_ROLE_POLICY_MAP, getEffectivePolicy } from '../src/ralph/rolePolicy';
import { contextEnvelopePath } from '../src/ralph/artifactStore';
import type { RolePolicyMap } from '../src/ralph/types';

// ---------------------------------------------------------------------------
// DEFAULT_ROLE_POLICY_MAP round-trips to/from JSON cleanly
// ---------------------------------------------------------------------------

test('DEFAULT_ROLE_POLICY_MAP round-trips to/from JSON without data loss', () => {
  const json = JSON.stringify(DEFAULT_ROLE_POLICY_MAP);
  const parsed = JSON.parse(json) as RolePolicyMap;

  assert.deepEqual(parsed, DEFAULT_ROLE_POLICY_MAP);
});

test('DEFAULT_ROLE_POLICY_MAP covers all 7 RalphAgentRole values', () => {
  const requiredRoles = ['build', 'review', 'watchdog', 'scm', 'planner', 'implementer', 'reviewer'] as const;

  for (const role of requiredRoles) {
    assert.ok(role in DEFAULT_ROLE_POLICY_MAP, `missing role: ${role}`);
    const policy = DEFAULT_ROLE_POLICY_MAP[role];
    assert.equal(policy.role, role);
    assert.ok(Array.isArray(policy.allowedNodeKinds), `${role}.allowedNodeKinds is not an array`);
    assert.ok(Array.isArray(policy.allowedTaskStateMutations), `${role}.allowedTaskStateMutations is not an array`);
    assert.ok(Array.isArray(policy.requiredVerifierGates), `${role}.requiredVerifierGates is not an array`);
    assert.equal(typeof policy.humanGateRequired, 'boolean', `${role}.humanGateRequired is not a boolean`);
  }
});

test('DEFAULT_ROLE_POLICY_MAP planner policy has humanGateRequired=true and no direct task mutations', () => {
  const policy = DEFAULT_ROLE_POLICY_MAP['planner'];
  assert.equal(policy.humanGateRequired, true);
  assert.equal(policy.allowedTaskStateMutations.length, 0);
});

test('DEFAULT_ROLE_POLICY_MAP implementer policy has humanGateRequired=false and standard task mutations', () => {
  const policy = DEFAULT_ROLE_POLICY_MAP['implementer'];
  assert.equal(policy.humanGateRequired, false);
  assert.ok(policy.allowedTaskStateMutations.includes('todo→in_progress'));
  assert.ok(policy.allowedTaskStateMutations.includes('in_progress→done'));
  assert.ok(policy.allowedTaskStateMutations.includes('in_progress→blocked'));
  assert.ok(policy.requiredVerifierGates.includes('validationCommand'));
});

test('DEFAULT_ROLE_POLICY_MAP reviewer policy has humanGateRequired=true and changes_required mutation', () => {
  const policy = DEFAULT_ROLE_POLICY_MAP['reviewer'];
  assert.equal(policy.humanGateRequired, true);
  assert.ok(policy.allowedTaskStateMutations.includes('changes_required'));
});

// ---------------------------------------------------------------------------
// getEffectivePolicy: known and unknown role handling
// ---------------------------------------------------------------------------

test('getEffectivePolicy returns matching policy for a known role', () => {
  const policy = getEffectivePolicy('planner');
  assert.equal(policy.role, 'planner');
});

test('getEffectivePolicy falls back to implementer defaults for an unknown role', () => {
  const fallback = getEffectivePolicy('unknown-role-xyz');
  const implementer = DEFAULT_ROLE_POLICY_MAP['implementer'];
  assert.deepEqual(fallback, implementer);
});

test('getEffectivePolicy accepts a custom map override', () => {
  const customMap: RolePolicyMap = {
    ...DEFAULT_ROLE_POLICY_MAP,
    planner: {
      ...DEFAULT_ROLE_POLICY_MAP['planner'],
      humanGateRequired: false
    }
  };
  const policy = getEffectivePolicy('planner', customMap);
  assert.equal(policy.humanGateRequired, false);
});

// ---------------------------------------------------------------------------
// contextEnvelopePath returns expected path pattern
// ---------------------------------------------------------------------------

test('contextEnvelopePath returns path inside iteration directory with context-envelope.json', () => {
  const artifactRootDir = '/root/.ralph/artifacts';
  const result = contextEnvelopePath(artifactRootDir, 'iter-042');
  const expected = path.join(artifactRootDir, 'iteration-iter-042', 'context-envelope.json');
  assert.equal(result, expected);
});

test('contextEnvelopePath uses raw iterationId without zero-padding', () => {
  const result = contextEnvelopePath('/some/root', '5');
  assert.ok(result.includes('iteration-5'), `expected 'iteration-5' in path, got: ${result}`);
  assert.ok(!result.includes('iteration-005'), `should not zero-pad, got: ${result}`);
});

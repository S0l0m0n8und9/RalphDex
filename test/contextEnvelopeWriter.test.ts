import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { writeContextEnvelope } from '../src/ralph/contextEnvelopeWriter';

test('writeContextEnvelope defaults policySource to preset and writes iteration artifact', async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-context-envelope-'));
  const artifactRootDir = path.join(rootPath, '.ralph', 'artifacts');
  await fs.mkdir(artifactRootDir, { recursive: true });

  const filePath = await writeContextEnvelope({
    artifactRootDir,
    iteration: 5,
    contextEnvelope: {
      agentRole: 'implementer',
      exposedArtifacts: ['prompt-section://task-local-code-context', 'src/prompt/promptBuilder.ts'],
      omittedArtifacts: [{ path: 'prompt-section://verifier-outputs', reason: 'implementer_role_omits_verifier_outputs' }]
    }
  });

  const persisted = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
    iterationId: string;
    agentRole: string;
    policySource: string;
    exposedArtifacts: string[];
    omittedArtifacts: Array<{ path: string; reason: string }>;
  };

  assert.ok(filePath.endsWith(path.join('iteration-005', 'context-envelope.json')));
  assert.equal(persisted.iterationId, '5');
  assert.equal(persisted.agentRole, 'implementer');
  assert.equal(persisted.policySource, 'preset');
  assert.deepEqual(persisted.exposedArtifacts, ['prompt-section://task-local-code-context', 'src/prompt/promptBuilder.ts']);
  assert.deepEqual(persisted.omittedArtifacts, [
    { path: 'prompt-section://verifier-outputs', reason: 'implementer_role_omits_verifier_outputs' }
  ]);
});

import * as fs from 'fs/promises';
import * as path from 'path';
import { stableJson } from './integrity';
import { contextEnvelopePath } from './artifactStore';
import type { ContextEnvelope } from './types';

export async function writeContextEnvelope(input: {
  artifactRootDir: string;
  iteration: number;
  contextEnvelope: Omit<ContextEnvelope, 'iterationId' | 'policySource'>;
  policySource?: ContextEnvelope['policySource'];
}): Promise<string> {
  const iterationId = String(input.iteration);
  const filePath = contextEnvelopePath(input.artifactRootDir, iterationId.padStart(3, '0'));
  const envelope: ContextEnvelope = {
    iterationId,
    agentRole: input.contextEnvelope.agentRole,
    exposedArtifacts: [...input.contextEnvelope.exposedArtifacts].sort(),
    omittedArtifacts: [...input.contextEnvelope.omittedArtifacts].sort((left, right) => left.path.localeCompare(right.path)),
    policySource: input.policySource ?? 'preset'
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stableJson(envelope), 'utf8');
  return filePath;
}

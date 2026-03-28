import * as fs from 'fs/promises';
import * as path from 'path';
import { pathExists, readJsonRecord } from '../util/fs';
import {
  looksLikePreflightRecord,
  looksLikeIntegrityFailure,
  looksLikeProvenanceBundle,
  provenanceIdFromRecord,
  renderPreflightSummary,
  renderIntegrityFailureSummary,
  renderProvenanceSummary,
  renderLatestResultSummary
} from './artifactRendering';
import {
  resolveLatestArtifactPaths,
  PROTECTED_GENERATED_LATEST_POINTER_REFERENCES,
  type RalphGeneratedArtifactProtectionScope,
  type RalphLatestArtifactRepairSummary,
  type RalphProvenanceRetentionSummary,
  type RalphGeneratedArtifactRetentionSummary
} from './artifactStore';
import type {
  RalphIntegrityFailure,
  RalphPersistedPreflightReport,
  RalphPromptKind,
  RalphProvenanceBundle
} from './types';

interface RalphBundleRetentionInspection {
  bundleIds: string[];
  retainedBundleIds: string[];
  protectedBundleIds: string[];
}

interface RalphGeneratedArtifactRetentionInspection {
  iterationDirectories: { iteration: number; name: string }[];
  promptFiles: { iteration: number; name: string }[];
  runArtifacts: { baseName: string; iteration: number; fileNames: string[] }[];
  handoffFiles: { iteration: number; name: string }[];
  protectedArtifacts: RalphProtectedGeneratedArtifacts;
  iterationDirectoryDecision: {
    retainedNames: Set<string>;
    protectedRetainedNames: string[];
  };
  promptFileDecision: {
    retainedNames: Set<string>;
    protectedRetainedNames: string[];
  };
  runArtifactDecision: {
    retainedNames: Set<string>;
    protectedRetainedNames: string[];
  };
  handoffFileDecision: {
    retainedNames: Set<string>;
  };
}

interface RalphProtectedGeneratedArtifacts {
  iterationDirectories: Set<string>;
  promptFiles: Set<string>;
  runArtifactBaseNames: Set<string>;
}

interface RalphLatestGeneratedArtifactRecords {
  latestResult: Record<string, unknown> | null;
  latestPreflightReport: Record<string, unknown> | null;
  latestPromptEvidence: Record<string, unknown> | null;
  latestExecutionPlan: Record<string, unknown> | null;
  latestCliInvocation: Record<string, unknown> | null;
  latestProvenanceBundle: Record<string, unknown> | null;
  latestProvenanceFailure: Record<string, unknown> | null;
  latestSummaryText: string | null;
  latestPreflightSummaryText: string | null;
  latestProvenanceSummaryText: string | null;
}

function sortByIterationDesc<T extends { iteration: number; name: string }>(left: T, right: T): number {
  return right.iteration - left.iteration || right.name.localeCompare(left.name);
}

function retainedNamesByNewestAndProtected<T extends { iteration: number }>(
  entries: readonly T[],
  retentionCount: number,
  protectedNames: Iterable<string>,
  getName: (entry: T) => string
): Set<string> {
  // Protection augments the newest-N retention window; it never displaces newer entries.
  const retained = new Set(entries.slice(0, retentionCount).map((entry) => getName(entry)));
  for (const name of protectedNames) {
    retained.add(name);
  }
  return retained;
}

function retentionDecisionByNewestAndProtected<T extends { iteration: number }>(
  entries: readonly T[],
  retentionCount: number,
  protectedNames: Iterable<string>,
  getName: (entry: T) => string
): {
  retainedNames: Set<string>;
  protectedRetainedNames: string[];
} {
  const newestWindowNames = new Set(entries.slice(0, retentionCount).map((entry) => getName(entry)));
  const retainedNames = retainedNamesByNewestAndProtected(entries, retentionCount, protectedNames, getName);
  const protectedRetainedNames = entries
    .filter((entry) => {
      const name = getName(entry);
      return retainedNames.has(name) && !newestWindowNames.has(name);
    })
    .map((entry) => getName(entry));

  return {
    retainedNames,
    protectedRetainedNames
  };
}

function parseIterationDirectoryName(name: string): { iteration: number; name: string } | null {
  const match = /^iteration-(\d+)$/.exec(name);
  if (!match) {
    return null;
  }

  return {
    name,
    iteration: Number.parseInt(match[1], 10)
  };
}

function parsePromptFileName(name: string): { iteration: number; name: string } | null {
  const match = /^.+-(\d+)\.prompt\.md$/.exec(name);
  if (!match) {
    return null;
  }

  return {
    name,
    iteration: Number.parseInt(match[1], 10)
  };
}

function parseRunArtifactFileName(name: string): { baseName: string; iteration: number; name: string } | null {
  const match = /^(.+)-(\d+)\.(transcript|last-message)\.md$/.exec(name);
  if (!match) {
    return null;
  }

  return {
    name,
    baseName: `${match[1]}-${match[2]}`,
    iteration: Number.parseInt(match[2], 10)
  };
}

function parseHandoffFileName(name: string): { iteration: number; name: string } | null {
  const match = /^.+-(\d+)\.json$/.exec(name);
  if (!match) {
    return null;
  }

  return {
    name,
    iteration: Number.parseInt(match[1], 10)
  };
}

function createProtectedGeneratedArtifacts(): RalphProtectedGeneratedArtifacts {
  return {
    iterationDirectories: new Set<string>(),
    promptFiles: new Set<string>(),
    runArtifactBaseNames: new Set<string>()
  };
}

function isPathWithin(rootDir: string, targetPath: string): boolean {
  if (!path.isAbsolute(targetPath)) {
    return false;
  }

  const relative = path.relative(rootDir, targetPath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function readPathReference(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readRecordReference(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function compactPathReferences(references: Array<string | null>): string[] {
  return references.filter((value): value is string => Boolean(value));
}

function parsePromptEvidenceIdentity(record: Record<string, unknown> | null): {
  kind: RalphPromptKind;
  iteration: number;
} | null {
  if (!record) {
    return null;
  }

  const kind = record.kind;
  const iteration = record.iteration;
  if ((kind !== 'bootstrap'
    && kind !== 'iteration'
    && kind !== 'replenish-backlog'
    && kind !== 'fix-failure'
    && kind !== 'continue-progress'
    && kind !== 'human-review-handoff')
    || typeof iteration !== 'number'
    || !Number.isFinite(iteration)
    || iteration < 1) {
    return null;
  }

  return {
    kind,
    iteration: Math.floor(iteration)
  };
}

function derivedLatestPromptEvidenceReferences(
  record: Record<string, unknown> | null,
  dirs: {
    artifactRootDir: string;
    promptDir: string;
  }
): string[] {
  const identity = parsePromptEvidenceIdentity(record);
  if (!identity) {
    return [];
  }

  const paddedIteration = String(identity.iteration).padStart(3, '0');
  return [
    path.join(dirs.artifactRootDir, `iteration-${paddedIteration}`),
    path.join(dirs.promptDir, `${identity.kind}-${paddedIteration}.prompt.md`)
  ];
}

function readRecordArray(record: Record<string, unknown> | null, key: string): Record<string, unknown>[] {
  const value = record?.[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((candidate): candidate is Record<string, unknown> =>
    typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
  );
}

function addProtectedGeneratedArtifactPath(
  protectedArtifacts: RalphProtectedGeneratedArtifacts,
  input: {
    artifactRootDir: string;
    promptDir: string;
    runDir: string;
    targetPath: string;
  }
): void {
  const normalizedPath = path.normalize(input.targetPath);

  if (isPathWithin(input.artifactRootDir, normalizedPath)) {
    const relative = path.relative(input.artifactRootDir, normalizedPath);
    const [firstSegment] = relative.split(path.sep);
    if (firstSegment && parseIterationDirectoryName(firstSegment)) {
      protectedArtifacts.iterationDirectories.add(firstSegment);
    }
  }

  const baseName = path.basename(normalizedPath);

  if (isPathWithin(input.promptDir, normalizedPath)) {
    const parsedPrompt = parsePromptFileName(baseName);
    if (parsedPrompt) {
      protectedArtifacts.promptFiles.add(parsedPrompt.name);
    }
  }

  if (isPathWithin(input.runDir, normalizedPath)) {
    const parsedRunArtifact = parseRunArtifactFileName(baseName);
    if (parsedRunArtifact) {
      protectedArtifacts.runArtifactBaseNames.add(parsedRunArtifact.baseName);
    }
  }
}

function addProtectedGeneratedArtifactPaths(
  protectedArtifacts: RalphProtectedGeneratedArtifacts,
  input: {
    artifactRootDir: string;
    promptDir: string;
    runDir: string;
  },
  targetPaths: Iterable<string>
): void {
  for (const targetPath of targetPaths) {
    addProtectedGeneratedArtifactPath(protectedArtifacts, {
      ...input,
      targetPath
    });
  }
}

function readStateRunReference(candidate: Record<string, unknown> | null): {
  iteration: number | null;
  promptPath: string | null;
  transcriptPath: string | null;
  lastMessagePath: string | null;
} | null {
  if (!candidate) {
    return null;
  }

  const iteration = typeof candidate.iteration === 'number'
    && Number.isFinite(candidate.iteration)
    && candidate.iteration >= 1
    ? Math.floor(candidate.iteration)
    : null;
  const promptPath = readPathReference(candidate, 'promptPath');
  const transcriptPath = readPathReference(candidate, 'transcriptPath');
  const lastMessagePath = readPathReference(candidate, 'lastMessagePath');

  if (!promptPath && !transcriptPath && !lastMessagePath && iteration === null) {
    return null;
  }

  return {
    iteration,
    promptPath,
    transcriptPath,
    lastMessagePath
  };
}

function derivedIterationDirectoryPath(artifactRootDir: string, iteration: number): string {
  return path.join(artifactRootDir, `iteration-${String(iteration).padStart(3, '0')}`);
}

function currentStateArtifactReferences(input: {
  stateRecord: Record<string, unknown> | null;
  artifactRootDir: string;
  includeHistory?: boolean;
}): string[] {
  if (!input.stateRecord) {
    return [];
  }

  const runHistory = readRecordArray(input.stateRecord, 'runHistory')
    .map((record) => readStateRunReference(record))
    .filter((record): record is NonNullable<ReturnType<typeof readStateRunReference>> => record !== null);
  const lastRun = readStateRunReference(readRecordReference(input.stateRecord, 'lastRun')) ?? runHistory.at(-1) ?? null;
  const effectiveRunHistory = lastRun ? [...runHistory, lastRun] : runHistory;
  const iterationHistory = readRecordArray(input.stateRecord, 'iterationHistory');
  const effectiveIterationHistory = iterationHistory.length > 0
    ? iterationHistory
    : effectiveRunHistory.flatMap((runRecord) => {
      if (runRecord.iteration === null) {
        return [];
      }

      return [{
        artifactDir: derivedIterationDirectoryPath(input.artifactRootDir, runRecord.iteration),
        promptPath: runRecord.promptPath,
        execution: {
          transcriptPath: runRecord.transcriptPath,
          lastMessagePath: runRecord.lastMessagePath
        }
      }];
    });
  const lastIteration = readRecordReference(input.stateRecord, 'lastIteration') ?? effectiveIterationHistory.at(-1) ?? null;
  const lastIterationExecution = readRecordReference(lastIteration, 'execution');
  const references = compactPathReferences([
    readPathReference(input.stateRecord, 'lastPromptPath'),
    readPathReference(lastRun, 'promptPath'),
    readPathReference(lastRun, 'transcriptPath'),
    readPathReference(lastRun, 'lastMessagePath'),
    readPathReference(lastIteration, 'artifactDir'),
    readPathReference(lastIteration, 'promptPath'),
    readPathReference(lastIterationExecution, 'transcriptPath'),
    readPathReference(lastIterationExecution, 'lastMessagePath')
  ]);

  if (input.includeHistory ?? true) {
    for (const runRecord of runHistory) {
      references.push(...compactPathReferences([
        readPathReference(runRecord, 'promptPath'),
        readPathReference(runRecord, 'transcriptPath'),
        readPathReference(runRecord, 'lastMessagePath')
      ]));
    }

    for (const iterationRecord of effectiveIterationHistory) {
      const executionRecord = readRecordReference(iterationRecord, 'execution');
      references.push(...compactPathReferences([
        readPathReference(iterationRecord, 'artifactDir'),
        readPathReference(iterationRecord, 'promptPath'),
        readPathReference(executionRecord, 'transcriptPath'),
        readPathReference(executionRecord, 'lastMessagePath')
      ]));
    }
  }

  return references;
}

function latestArtifactReferences(
  records: RalphLatestGeneratedArtifactRecords,
  dirs: {
    artifactRootDir: string;
    promptDir: string;
  }
): string[] {
  const latestResultReferenceFields = PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-result.json'];
  const latestPreflightReferenceFields = PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-preflight-report.json'];
  const latestExecutionPlanReferenceFields = PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-execution-plan.json'];
  const latestCliInvocationReferenceFields = PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-cli-invocation.json'];
  const latestProvenanceBundleReferenceFields = PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-bundle.json'];
  const latestProvenanceFailureReferenceFields = PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-failure.json'];

  return compactPathReferences([
    ...latestResultReferenceFields.map((field) => readPathReference(records.latestResult, field)),
    ...latestPreflightReferenceFields.map((field) => readPathReference(records.latestPreflightReport, field)),
    ...latestExecutionPlanReferenceFields.map((field) => readPathReference(records.latestExecutionPlan, field)),
    ...latestCliInvocationReferenceFields.map((field) => readPathReference(records.latestCliInvocation, field)),
    ...latestProvenanceBundleReferenceFields.map((field) => readPathReference(records.latestProvenanceBundle, field)),
    ...latestProvenanceFailureReferenceFields.map((field) => readPathReference(records.latestProvenanceFailure, field)),
    ...derivedLatestPromptEvidenceReferences(records.latestPromptEvidence, dirs),
    ...derivedLatestSurfaceReferences({
      artifactRootDir: dirs.artifactRootDir,
      latestSummaryText: records.latestSummaryText,
      latestPreflightSummaryText: records.latestPreflightSummaryText,
      latestProvenanceSummaryText: records.latestProvenanceSummaryText
    })
  ]);
}

function parseIterationFromLatestSurface(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const headingMatch = /^# Ralph (?:Iteration|Preflight|Provenance Failure) (\d+)\s*$/m.exec(raw);
  if (headingMatch) {
    return Number.parseInt(headingMatch[1], 10);
  }

  const bulletMatch = /^- Iteration:\s+(\d+)\s*$/m.exec(raw);
  if (bulletMatch) {
    return Number.parseInt(bulletMatch[1], 10);
  }

  return null;
}

function parseArtifactPathsFromLatestSurface(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  const pathLabels = new Set([
    'Prompt',
    'Report',
    'Preflight report',
    'Preflight summary',
    'Iteration artifact dir'
  ]);
  const extractedPaths: string[] = [];

  for (const line of raw.split(/\r?\n/u)) {
    const match = /^- ([^:]+):\s+(.+?)\s*$/.exec(line);
    if (!match || !pathLabels.has(match[1])) {
      continue;
    }

    extractedPaths.push(match[2].trim());
  }

  return extractedPaths;
}

function derivedLatestSurfaceReferences(input: {
  artifactRootDir: string;
  latestSummaryText: string | null;
  latestPreflightSummaryText: string | null;
  latestProvenanceSummaryText: string | null;
}): string[] {
  const surfaces = [
    input.latestSummaryText,
    input.latestPreflightSummaryText,
    input.latestProvenanceSummaryText
  ];
  const iterations = surfaces
    .map((surface) => parseIterationFromLatestSurface(surface))
    .filter((value): value is number => value !== null);
  const artifactPaths = surfaces.flatMap((surface) => parseArtifactPathsFromLatestSurface(surface));

  return [
    ...artifactPaths,
    ...iterations.map((iteration) => derivedIterationDirectoryPath(input.artifactRootDir, iteration))
  ];
}

async function readTextRecord(target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    return null;
  }
}

async function resolveProtectedBundleIds(artifactRootDir: string): Promise<Set<string>> {
  const latestPaths = resolveLatestArtifactPaths(artifactRootDir);
  const records = await Promise.all([
    readJsonRecord(latestPaths.latestResultPath),
    readJsonRecord(latestPaths.latestPreflightReportPath),
    readJsonRecord(latestPaths.latestPromptEvidencePath),
    readJsonRecord(latestPaths.latestExecutionPlanPath),
    readJsonRecord(latestPaths.latestCliInvocationPath),
    readJsonRecord(latestPaths.latestProvenanceBundlePath),
    readJsonRecord(latestPaths.latestProvenanceFailurePath)
  ]);

  return new Set(records
    .map((record) => provenanceIdFromRecord(record))
    .filter((value): value is string => Boolean(value)));
}

export async function repairLatestArtifactSurfaces(artifactRootDir: string): Promise<RalphLatestArtifactRepairSummary> {
  const latestPaths = resolveLatestArtifactPaths(artifactRootDir);
  const repairedLatestArtifactPaths: string[] = [];
  const staleLatestArtifactPaths: string[] = [];
  const [
    latestResultExists,
    latestSummaryExists,
    latestPreflightReportRecord,
    latestPreflightSummaryExists,
    latestProvenanceBundleRecord,
    latestProvenanceSummaryExists
  ] = await Promise.all([
    pathExists(latestPaths.latestResultPath),
    pathExists(latestPaths.latestSummaryPath),
    readJsonRecord(latestPaths.latestPreflightReportPath),
    pathExists(latestPaths.latestPreflightSummaryPath),
    readJsonRecord(latestPaths.latestProvenanceBundlePath),
    pathExists(latestPaths.latestProvenanceSummaryPath)
  ]);

  if (!latestSummaryExists && latestResultExists) {
    const latestResultRecord = await readJsonRecord(latestPaths.latestResultPath);
    const repairedSummary = looksLikePreflightRecord(latestResultRecord)
      ? renderPreflightSummary(latestResultRecord as unknown as RalphPersistedPreflightReport)
      : looksLikeIntegrityFailure(latestResultRecord)
        ? renderIntegrityFailureSummary(latestResultRecord as unknown as RalphIntegrityFailure)
        : latestResultRecord
          ? renderLatestResultSummary(latestResultRecord)
          : null;

    if (repairedSummary) {
      await fs.writeFile(latestPaths.latestSummaryPath, `${repairedSummary.trimEnd()}\n`, 'utf8');
      repairedLatestArtifactPaths.push(latestPaths.latestSummaryPath);
    } else {
      staleLatestArtifactPaths.push(latestPaths.latestSummaryPath);
    }
  }

  if (!latestPreflightSummaryExists && looksLikePreflightRecord(latestPreflightReportRecord)) {
    const repairedSummary = renderPreflightSummary(latestPreflightReportRecord as unknown as RalphPersistedPreflightReport);
    await fs.writeFile(latestPaths.latestPreflightSummaryPath, `${repairedSummary.trimEnd()}\n`, 'utf8');
    repairedLatestArtifactPaths.push(latestPaths.latestPreflightSummaryPath);
  } else if (!latestPreflightSummaryExists && latestPreflightReportRecord) {
    staleLatestArtifactPaths.push(latestPaths.latestPreflightSummaryPath);
  }

  if (!latestProvenanceSummaryExists && looksLikeProvenanceBundle(latestProvenanceBundleRecord)) {
    const repairedSummary = renderProvenanceSummary(latestProvenanceBundleRecord as unknown as RalphProvenanceBundle);
    await fs.writeFile(latestPaths.latestProvenanceSummaryPath, `${repairedSummary.trimEnd()}\n`, 'utf8');
    repairedLatestArtifactPaths.push(latestPaths.latestProvenanceSummaryPath);
  } else if (!latestProvenanceSummaryExists && latestProvenanceBundleRecord) {
    staleLatestArtifactPaths.push(latestPaths.latestProvenanceSummaryPath);
  }

  return {
    repairedLatestArtifactPaths,
    staleLatestArtifactPaths
  };
}

async function resolveProtectedGeneratedArtifacts(input: {
  artifactRootDir: string;
  promptDir: string;
  runDir: string;
  stateFilePath: string;
  protectionScope?: RalphGeneratedArtifactProtectionScope;
}): Promise<RalphProtectedGeneratedArtifacts> {
  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
  const [
    stateRecord,
    latestResult,
    latestPreflightReport,
    latestPromptEvidence,
    latestExecutionPlan,
    latestCliInvocation,
    latestProvenanceBundle,
    latestProvenanceFailure,
    latestSummaryText,
    latestPreflightSummaryText,
    latestProvenanceSummaryText
  ] = await Promise.all([
    readJsonRecord(input.stateFilePath),
    readJsonRecord(latestPaths.latestResultPath),
    readJsonRecord(latestPaths.latestPreflightReportPath),
    readJsonRecord(latestPaths.latestPromptEvidencePath),
    readJsonRecord(latestPaths.latestExecutionPlanPath),
    readJsonRecord(latestPaths.latestCliInvocationPath),
    readJsonRecord(latestPaths.latestProvenanceBundlePath),
    readJsonRecord(latestPaths.latestProvenanceFailurePath),
    readTextRecord(latestPaths.latestSummaryPath),
    readTextRecord(latestPaths.latestPreflightSummaryPath),
    readTextRecord(latestPaths.latestProvenanceSummaryPath)
  ]);
  const protectedArtifacts = createProtectedGeneratedArtifacts();
  const pathInput = {
    artifactRootDir: input.artifactRootDir,
    promptDir: input.promptDir,
    runDir: input.runDir
  };

  addProtectedGeneratedArtifactPaths(protectedArtifacts, pathInput, currentStateArtifactReferences({
    stateRecord,
    artifactRootDir: input.artifactRootDir,
    includeHistory: (input.protectionScope ?? 'fullStateAndLatest') === 'fullStateAndLatest'
  }));
  addProtectedGeneratedArtifactPaths(protectedArtifacts, pathInput, latestArtifactReferences({
    latestResult,
    latestPreflightReport,
    latestPromptEvidence,
    latestExecutionPlan,
    latestCliInvocation,
    latestProvenanceBundle,
    latestProvenanceFailure,
    latestSummaryText,
    latestPreflightSummaryText,
    latestProvenanceSummaryText
  }, pathInput));

  return protectedArtifacts;
}

async function collectProvenanceBundleRetentionInspection(input: {
  artifactRootDir: string;
  retentionCount: number;
}): Promise<RalphBundleRetentionInspection> {
  const runsDir = path.join(input.artifactRootDir, 'runs');
  const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const bundleIds = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('run-'))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  const protectedIds = Array.from(await resolveProtectedBundleIds(input.artifactRootDir)).sort();
  const retainedIds = new Set(input.retentionCount <= 0 ? bundleIds : bundleIds.slice(0, input.retentionCount));
  protectedIds.forEach((bundleId) => retainedIds.add(bundleId));

  return {
    bundleIds,
    retainedBundleIds: bundleIds.filter((bundleId) => retainedIds.has(bundleId)),
    protectedBundleIds: protectedIds
  };
}

async function collectGeneratedArtifactRetentionInspection(input: {
  artifactRootDir: string;
  promptDir: string;
  runDir: string;
  handoffDir?: string;
  stateFilePath: string;
  retentionCount: number;
  protectionScope?: RalphGeneratedArtifactProtectionScope;
}): Promise<RalphGeneratedArtifactRetentionInspection> {
  const [artifactEntries, promptEntries, runEntries, protectedArtifacts] = await Promise.all([
    fs.readdir(input.artifactRootDir, { withFileTypes: true }).catch(() => []),
    fs.readdir(input.promptDir, { withFileTypes: true }).catch(() => []),
    fs.readdir(input.runDir, { withFileTypes: true }).catch(() => []),
    resolveProtectedGeneratedArtifacts({
      artifactRootDir: input.artifactRootDir,
      promptDir: input.promptDir,
      runDir: input.runDir,
      stateFilePath: input.stateFilePath,
      protectionScope: input.protectionScope
    })
  ]);
  const handoffEntries = input.handoffDir
    ? await fs.readdir(input.handoffDir, { withFileTypes: true }).catch(() => [])
    : [];

  const iterationDirectories = artifactEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseIterationDirectoryName(entry.name))
    .filter((entry): entry is { iteration: number; name: string } => entry !== null)
    .sort(sortByIterationDesc);
  const promptFiles = promptEntries
    .filter((entry) => entry.isFile())
    .map((entry) => parsePromptFileName(entry.name))
    .filter((entry): entry is { iteration: number; name: string } => entry !== null)
    .sort(sortByIterationDesc);
  const runArtifactGroups = new Map<string, { baseName: string; iteration: number; fileNames: string[] }>();
  for (const entry of runEntries.filter((candidate) => candidate.isFile())) {
    const parsed = parseRunArtifactFileName(entry.name);
    if (!parsed) {
      continue;
    }

    const current = runArtifactGroups.get(parsed.baseName);
    if (current) {
      current.fileNames.push(parsed.name);
      continue;
    }

    runArtifactGroups.set(parsed.baseName, {
      baseName: parsed.baseName,
      iteration: parsed.iteration,
      fileNames: [parsed.name]
    });
  }

  const runArtifacts = Array.from(runArtifactGroups.values()).sort((left, right) =>
    right.iteration - left.iteration || right.baseName.localeCompare(left.baseName)
  );
  const handoffFiles = handoffEntries
    .filter((entry) => entry.isFile())
    .map((entry) => parseHandoffFileName(entry.name))
    .filter((entry): entry is { iteration: number; name: string } => entry !== null)
    .sort(sortByIterationDesc);
  const effectiveRetentionCount = input.retentionCount <= 0
    ? Math.max(iterationDirectories.length, promptFiles.length, runArtifacts.length, handoffFiles.length)
    : input.retentionCount;

  return {
    iterationDirectories,
    promptFiles,
    runArtifacts,
    handoffFiles,
    protectedArtifacts,
    iterationDirectoryDecision: retentionDecisionByNewestAndProtected(
      iterationDirectories,
      effectiveRetentionCount,
      protectedArtifacts.iterationDirectories,
      (entry) => entry.name
    ),
    promptFileDecision: retentionDecisionByNewestAndProtected(
      promptFiles,
      effectiveRetentionCount,
      protectedArtifacts.promptFiles,
      (entry) => entry.name
    ),
    runArtifactDecision: retentionDecisionByNewestAndProtected(
      runArtifacts,
      effectiveRetentionCount,
      protectedArtifacts.runArtifactBaseNames,
      (entry) => entry.baseName
    ),
    handoffFileDecision: {
      retainedNames: retainedNamesByNewestAndProtected(
        handoffFiles,
        effectiveRetentionCount,
        [],
        (entry) => entry.name
      )
    }
  };
}

export async function cleanupProvenanceBundles(input: {
  artifactRootDir: string;
  retentionCount: number;
}): Promise<RalphProvenanceRetentionSummary> {
  const inspection = await collectProvenanceBundleRetentionInspection(input);
  if (input.retentionCount <= 0) {
    return {
      deletedBundleIds: [],
      retainedBundleIds: inspection.retainedBundleIds,
      protectedBundleIds: inspection.protectedBundleIds
    };
  }

  const runsDir = path.join(input.artifactRootDir, 'runs');
  const retainedIds = new Set(inspection.retainedBundleIds);

  const deletedBundleIds: string[] = [];
  for (const bundleId of inspection.bundleIds.slice(input.retentionCount)) {
    if (retainedIds.has(bundleId)) {
      continue;
    }

    await fs.rm(path.join(runsDir, bundleId), { recursive: true, force: true });
    deletedBundleIds.push(bundleId);
  }

  return {
    deletedBundleIds,
    retainedBundleIds: inspection.retainedBundleIds,
    protectedBundleIds: inspection.protectedBundleIds
  };
}

export async function inspectProvenanceBundleRetention(input: {
  artifactRootDir: string;
  retentionCount: number;
}): Promise<RalphProvenanceRetentionSummary> {
  const inspection = await collectProvenanceBundleRetentionInspection(input);
  return {
    deletedBundleIds: [],
    retainedBundleIds: inspection.retainedBundleIds,
    protectedBundleIds: inspection.protectedBundleIds
  };
}

export async function cleanupGeneratedArtifacts(input: {
  artifactRootDir: string;
  promptDir: string;
  runDir: string;
  handoffDir?: string;
  stateFilePath: string;
  retentionCount: number;
  protectionScope?: RalphGeneratedArtifactProtectionScope;
}): Promise<RalphGeneratedArtifactRetentionSummary> {
  if (input.retentionCount <= 0) {
    const summary: RalphGeneratedArtifactRetentionSummary = {
      deletedIterationDirectories: [],
      retainedIterationDirectories: [],
      protectedRetainedIterationDirectories: [],
      deletedPromptFiles: [],
      retainedPromptFiles: [],
      protectedRetainedPromptFiles: [],
      deletedRunArtifactBaseNames: [],
      retainedRunArtifactBaseNames: [],
      protectedRetainedRunArtifactBaseNames: []
    };
    if (input.handoffDir) {
      summary.deletedHandoffFiles = [];
      summary.retainedHandoffFiles = [];
    }
    return summary;
  }
  const inspection = await collectGeneratedArtifactRetentionInspection(input);

  const retainedIterationDirectories = inspection.iterationDirectoryDecision.retainedNames;
  const deletedIterationDirectories: string[] = [];
  for (const entry of inspection.iterationDirectories.slice(input.retentionCount)) {
    if (retainedIterationDirectories.has(entry.name)) {
      continue;
    }
    await fs.rm(path.join(input.artifactRootDir, entry.name), { recursive: true, force: true });
    deletedIterationDirectories.push(entry.name);
  }

  const retainedPromptFiles = inspection.promptFileDecision.retainedNames;
  const deletedPromptFiles: string[] = [];
  for (const entry of inspection.promptFiles.slice(input.retentionCount)) {
    if (retainedPromptFiles.has(entry.name)) {
      continue;
    }
    await fs.rm(path.join(input.promptDir, entry.name), { force: true });
    deletedPromptFiles.push(entry.name);
  }

  const retainedRunArtifactBaseNames = inspection.runArtifactDecision.retainedNames;
  const deletedRunArtifactBaseNames: string[] = [];
  for (const entry of inspection.runArtifacts.slice(input.retentionCount)) {
    if (retainedRunArtifactBaseNames.has(entry.baseName)) {
      continue;
    }
    await Promise.all(entry.fileNames.map((fileName) => fs.rm(path.join(input.runDir, fileName), { force: true })));
    deletedRunArtifactBaseNames.push(entry.baseName);
  }

  const summary: RalphGeneratedArtifactRetentionSummary = {
    deletedIterationDirectories,
    retainedIterationDirectories: inspection.iterationDirectories
      .filter((entry) => inspection.iterationDirectoryDecision.retainedNames.has(entry.name))
      .map((entry) => entry.name),
    protectedRetainedIterationDirectories: inspection.iterationDirectoryDecision.protectedRetainedNames,
    deletedPromptFiles,
    retainedPromptFiles: inspection.promptFiles
      .filter((entry) => inspection.promptFileDecision.retainedNames.has(entry.name))
      .map((entry) => entry.name),
    protectedRetainedPromptFiles: inspection.promptFileDecision.protectedRetainedNames,
    deletedRunArtifactBaseNames,
    retainedRunArtifactBaseNames: inspection.runArtifacts
      .filter((entry) => inspection.runArtifactDecision.retainedNames.has(entry.baseName))
      .map((entry) => entry.baseName),
    protectedRetainedRunArtifactBaseNames: inspection.runArtifactDecision.protectedRetainedNames
  };

  if (input.handoffDir) {
    const retainedHandoffFiles = inspection.handoffFileDecision.retainedNames;
    const deletedHandoffFiles: string[] = [];
    for (const entry of inspection.handoffFiles.slice(input.retentionCount)) {
      if (retainedHandoffFiles.has(entry.name)) {
        continue;
      }
      await fs.rm(path.join(input.handoffDir, entry.name), { force: true });
      deletedHandoffFiles.push(entry.name);
    }

    summary.deletedHandoffFiles = deletedHandoffFiles;
    summary.retainedHandoffFiles = inspection.handoffFiles
      .filter((entry) => retainedHandoffFiles.has(entry.name))
      .map((entry) => entry.name);
  };

  return summary;
}

export async function inspectGeneratedArtifactRetention(input: {
  artifactRootDir: string;
  promptDir: string;
  runDir: string;
  handoffDir?: string;
  stateFilePath: string;
  retentionCount: number;
  protectionScope?: RalphGeneratedArtifactProtectionScope;
}): Promise<RalphGeneratedArtifactRetentionSummary> {
  const inspection = await collectGeneratedArtifactRetentionInspection(input);
  const summary: RalphGeneratedArtifactRetentionSummary = {
    deletedIterationDirectories: [],
    retainedIterationDirectories: inspection.iterationDirectories
      .filter((entry) => inspection.iterationDirectoryDecision.retainedNames.has(entry.name))
      .map((entry) => entry.name),
    protectedRetainedIterationDirectories: inspection.iterationDirectoryDecision.protectedRetainedNames,
    deletedPromptFiles: [],
    retainedPromptFiles: inspection.promptFiles
      .filter((entry) => inspection.promptFileDecision.retainedNames.has(entry.name))
      .map((entry) => entry.name),
    protectedRetainedPromptFiles: inspection.promptFileDecision.protectedRetainedNames,
    deletedRunArtifactBaseNames: [],
    retainedRunArtifactBaseNames: inspection.runArtifacts
      .filter((entry) => inspection.runArtifactDecision.retainedNames.has(entry.baseName))
      .map((entry) => entry.baseName),
    protectedRetainedRunArtifactBaseNames: inspection.runArtifactDecision.protectedRetainedNames
  };

  if (input.handoffDir) {
    summary.deletedHandoffFiles = [];
    summary.retainedHandoffFiles = inspection.handoffFiles
      .filter((entry) => inspection.handoffFileDecision.retainedNames.has(entry.name))
      .map((entry) => entry.name);
  }

  return summary;
}

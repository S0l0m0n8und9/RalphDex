import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { RepoSummary } from './types';

const CANDIDATES = {
  manifests: ['package.json', 'pnpm-workspace.yaml', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'global.json', '*.sln'],
  ciFiles: ['.github/workflows', 'azure-pipelines.yml', '.gitlab-ci.yml'],
  docs: ['README.md', 'docs', 'AGENTS.md'],
  sourceRoots: ['src', 'app', 'apps', 'packages', 'services', 'backend', 'frontend']
};

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findSolutionFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sln')).map((entry) => entry.name);
}

function detectPackageManagers(manifests: string[]): string[] {
  const packageManagers = new Set<string>();
  for (const manifest of manifests) {
    if (manifest.includes('package.json')) packageManagers.add('npm');
    if (manifest.includes('pnpm-workspace.yaml')) packageManagers.add('pnpm');
    if (manifest.includes('pyproject.toml') || manifest.includes('requirements.txt')) packageManagers.add('python');
    if (manifest.includes('Cargo.toml')) packageManagers.add('cargo');
    if (manifest.includes('go.mod')) packageManagers.add('go');
    if (manifest.includes('pom.xml') || manifest.includes('build.gradle')) packageManagers.add('java');
    if (manifest.endsWith('.sln') || manifest.includes('global.json')) packageManagers.add('dotnet');
  }
  return Array.from(packageManagers);
}

function inferTestSignals(manifests: string[], docs: string[]): string[] {
  const signals = new Set<string>();
  for (const manifest of manifests) {
    if (manifest.includes('package.json')) signals.add('Check package.json scripts for test/lint/build.');
    if (manifest.includes('pyproject.toml') || manifest.includes('requirements.txt')) signals.add('Check pytest/tox/nox configuration.');
    if (manifest.includes('Cargo.toml')) signals.add('cargo test likely available.');
    if (manifest.endsWith('.sln') || manifest.includes('global.json')) signals.add('dotnet test likely available.');
  }
  if (docs.some((item) => item.toLowerCase().includes('readme'))) {
    signals.add('Inspect README.md for canonical dev commands.');
  }
  return Array.from(signals);
}

export async function scanWorkspace(): Promise<RepoSummary> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('Open a workspace folder before using Ralph Codex Workbench.');
  }

  const rootPath = folder.uri.fsPath;
  const manifests: string[] = [];
  for (const candidate of CANDIDATES.manifests) {
    if (candidate === '*.sln') {
      manifests.push(...(await findSolutionFiles(rootPath)));
      continue;
    }
    const target = path.join(rootPath, candidate);
    if (await exists(target)) manifests.push(candidate);
  }

  const ciFiles: string[] = [];
  for (const candidate of CANDIDATES.ciFiles) {
    const target = path.join(rootPath, candidate);
    if (await exists(target)) ciFiles.push(candidate);
  }

  const docs: string[] = [];
  for (const candidate of CANDIDATES.docs) {
    const target = path.join(rootPath, candidate);
    if (await exists(target)) docs.push(candidate);
  }

  const sourceRoots: string[] = [];
  for (const candidate of CANDIDATES.sourceRoots) {
    const target = path.join(rootPath, candidate);
    if (await exists(target)) sourceRoots.push(candidate);
  }

  return {
    workspaceName: folder.name,
    rootPath,
    manifests,
    packageManagers: detectPackageManagers(manifests),
    testSignals: inferTestSignals(manifests, docs),
    ciFiles,
    docs,
    sourceRoots
  };
}

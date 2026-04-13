import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { resolveRalphPaths } from '../ralph/pathResolver';
import { readTaskPlan } from '../ralph/planningPass';
import { deriveEffectiveTier } from '../ralph/complexityScorer';
import { readDeadLetterQueue, type DeadLetterEntry } from '../ralph/deadLetter';
import { getFailureAnalysisPath, parseFailureDiagnosticResponse } from '../ralph/failureDiagnostics';
import type { RalphTaskClaimGraphEntry } from '../ralph/taskClaims';
import { inspectTaskClaimGraph, parseTaskFile, selectNextTask } from '../ralph/taskFile';
import type {
  RalphTask,
  RalphTaskFile,
  RalphWorkspaceState
} from '../ralph/types';

type TaskGroupKind = 'active' | 'dead-letter';

interface TaskTreeSnapshot {
  taskFile: RalphTaskFile | null;
  selectedTaskId: string | null;
  iterationHistory: RalphWorkspaceState['iterationHistory'];
  claimEntries: Map<string, RalphTaskClaimGraphEntry>;
  deadLetterEntries: Map<string, DeadLetterEntry>;
  deadLetterOrder: string[];
  simpleThreshold: number;
  complexThreshold: number;
  artifactDir: string;
}

abstract class TaskTreeNode extends vscode.TreeItem {
  public constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}

class TaskGroupItem extends TaskTreeNode {
  public constructor(
    public readonly groupKind: TaskGroupKind,
    count: number
  ) {
    super(groupKind === 'active' ? 'Active Tasks' : 'Dead-Letter Queue', vscode.TreeItemCollapsibleState.Expanded);
    this.description = String(count);
    this.contextValue = `ralph-task-group:${groupKind}`;
  }
}

class TaskRowItem extends TaskTreeNode {
  public constructor(
    public readonly groupKind: TaskGroupKind,
    public readonly taskId: string,
    title: string
  ) {
    super(taskId, vscode.TreeItemCollapsibleState.Collapsed);
    this.tooltip = `${taskId}: ${title}`;
    this.contextValue = `ralph-task:${groupKind}`;
  }
}

class DetailItem extends TaskTreeNode {
  public constructor(
    label: string,
    description?: string,
    command?: vscode.Command
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.command = command;
    this.contextValue = 'ralph-task-detail';
  }
}

class MessageItem extends TaskTreeNode {
  public constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'ralph-task-message';
  }
}

async function readWorkspaceState(stateFilePath: string): Promise<RalphWorkspaceState | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(stateFilePath, 'utf8')) as RalphWorkspaceState;
    return parsed && parsed.version === 2 ? parsed : null;
  } catch {
    return null;
  }
}

function describeTask(input: {
  task: RalphTask | null;
  deadLetterEntry?: DeadLetterEntry;
  claimEntry?: RalphTaskClaimGraphEntry;
  selectedTaskId: string | null;
  tierLabel: string | null;
  groupKind: TaskGroupKind;
}): string {
  const parts: string[] = [];

  if (input.groupKind === 'dead-letter') {
    parts.push('dead-letter');
  }

  if (input.task) {
    parts.push(input.task.status);
  }

  if (input.tierLabel) {
    parts.push(`tier: ${input.tierLabel}`);
  }

  if (input.task?.dependsOn?.length) {
    parts.push(`depends: ${input.task.dependsOn.join(', ')}`);
  }

  const claim = input.claimEntry?.canonicalClaim;
  if (claim?.claim) {
    parts.push(`claim: ${claim.claim.agentId}${claim.stale ? ' (stale)' : ''}`);
  }

  if (input.deadLetterEntry) {
    parts.push(`attempts: ${input.deadLetterEntry.recoveryAttemptCount}`);
  }

  if (input.task?.id && input.selectedTaskId === input.task.id) {
    parts.push('selected');
  }

  return parts.join(' | ');
}

export class RalphTaskTreeDataProvider implements vscode.TreeDataProvider<TaskTreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TaskTreeNode | undefined | void>();

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(private readonly workspaceFolder: vscode.WorkspaceFolder) {}

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  public getTreeItem(element: TaskTreeNode): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: TaskTreeNode): Promise<TaskTreeNode[]> {
    const snapshot = await this.loadSnapshot();
    if (!element) {
      const activeCount = snapshot.taskFile
        ? snapshot.taskFile.tasks.filter((task) => !snapshot.deadLetterEntries.has(task.id)).length
        : 0;
      return [
        new TaskGroupItem('active', activeCount),
        new TaskGroupItem('dead-letter', snapshot.deadLetterOrder.length)
      ];
    }

    if (element instanceof TaskGroupItem) {
      return element.groupKind === 'active'
        ? this.buildActiveTaskRows(snapshot)
        : this.buildDeadLetterRows(snapshot);
    }

    if (element instanceof TaskRowItem) {
      return this.buildTaskDetailRows(snapshot, element);
    }

    return [];
  }

  private async loadSnapshot(): Promise<TaskTreeSnapshot> {
    const config = readConfig(this.workspaceFolder);
    const paths = resolveRalphPaths(this.workspaceFolder.uri.fsPath, config);

    let taskFile: RalphTaskFile | null = null;
    try {
      taskFile = parseTaskFile(await fs.readFile(paths.taskFilePath, 'utf8'));
    } catch {
      taskFile = null;
    }

    const workspaceState = await readWorkspaceState(paths.stateFilePath);
    const selectedTaskId = taskFile
      ? (workspaceState?.lastIteration?.selectedTaskId ?? selectNextTask(taskFile)?.id ?? null)
      : null;
    const claimGraph = await inspectTaskClaimGraph(paths.claimFilePath).catch(() => null);
    const deadLetterQueue = await readDeadLetterQueue(paths.deadLetterPath).catch(() => null);

    return {
      taskFile,
      selectedTaskId,
      iterationHistory: workspaceState?.iterationHistory ?? [],
      claimEntries: new Map((claimGraph?.tasks ?? []).map((entry) => [entry.taskId, entry])),
      deadLetterEntries: new Map((deadLetterQueue?.entries ?? []).map((entry) => [entry.taskId, entry])),
      deadLetterOrder: (deadLetterQueue?.entries ?? []).map((entry) => entry.taskId),
      simpleThreshold: config.modelTiering.simpleThreshold,
      complexThreshold: config.modelTiering.complexThreshold,
      artifactDir: paths.artifactDir
    };
  }

  private buildActiveTaskRows(snapshot: TaskTreeSnapshot): TaskTreeNode[] {
    if (!snapshot.taskFile) {
      return [new MessageItem('No task file available.')];
    }

    const rows = snapshot.taskFile.tasks
      .filter((task) => !snapshot.deadLetterEntries.has(task.id))
      .map((task) => this.buildTaskRow(snapshot, task, 'active'));

    return rows.length > 0 ? rows : [new MessageItem('No active durable tasks.')];
  }

  private buildDeadLetterRows(snapshot: TaskTreeSnapshot): TaskTreeNode[] {
    if (snapshot.deadLetterOrder.length === 0) {
      return [new MessageItem('No tasks are parked in dead-letter.')];
    }

    return snapshot.deadLetterOrder.map((taskId) => {
      const task = snapshot.taskFile?.tasks.find((candidate) => candidate.id === taskId) ?? null;
      const title = task?.title ?? snapshot.deadLetterEntries.get(taskId)?.taskTitle ?? taskId;
      return this.buildTaskRow(snapshot, task ?? {
        id: taskId,
        title,
        status: 'blocked'
      }, 'dead-letter');
    });
  }

  private buildTaskRow(
    snapshot: TaskTreeSnapshot,
    task: RalphTask,
    groupKind: TaskGroupKind
  ): TaskRowItem {
    const row = new TaskRowItem(groupKind, task.id, task.title);
    const tierInfo = snapshot.taskFile
      ? deriveEffectiveTier({
        task,
        taskFile: snapshot.taskFile,
        iterationHistory: snapshot.iterationHistory,
        simpleThreshold: snapshot.simpleThreshold,
        complexThreshold: snapshot.complexThreshold
      })
      : null;
    row.description = describeTask({
      task,
      deadLetterEntry: snapshot.deadLetterEntries.get(task.id),
      claimEntry: snapshot.claimEntries.get(task.id),
      selectedTaskId: snapshot.selectedTaskId,
      tierLabel: tierInfo?.tier ?? null,
      groupKind
    });
    row.tooltip = `${task.id}: ${task.title}`;
    return row;
  }

  private async buildTaskDetailRows(
    snapshot: TaskTreeSnapshot,
    row: TaskRowItem
  ): Promise<TaskTreeNode[]> {
    const task = snapshot.taskFile?.tasks.find((candidate) => candidate.id === row.taskId) ?? null;
    const deadLetterEntry = snapshot.deadLetterEntries.get(row.taskId);
    const claimEntry = snapshot.claimEntries.get(row.taskId);
    const details: TaskTreeNode[] = [];

    if (task) {
      const tierInfo = snapshot.taskFile
        ? deriveEffectiveTier({
          task,
          taskFile: snapshot.taskFile,
          iterationHistory: snapshot.iterationHistory,
          simpleThreshold: snapshot.simpleThreshold,
          complexThreshold: snapshot.complexThreshold
        })
        : null;
      details.push(new DetailItem('Task', `${task.title} | status: ${task.status}${tierInfo ? ` | tier: ${tierInfo.tier}` : ''}`));
    }

    if (claimEntry?.canonicalClaim?.claim) {
      const claim = claimEntry.canonicalClaim;
      details.push(new DetailItem(
        'Claim',
        `${claim.claim.agentId}/${claim.claim.provenanceId} | ${claim.claim.claimedAt}${claim.stale ? ' | stale' : ''}`
      ));
      if (claim.stale) {
        details.push(new DetailItem(
          'Resolve stale claim',
          'Run the supported stale-claim recovery command.',
          {
            command: 'ralphCodex.resolveStaleTaskClaim',
            title: 'Resolve Stale Task Claim'
          }
        ));
      }
    }

    const taskPlan = await readTaskPlan(snapshot.artifactDir, row.taskId);
    if (taskPlan) {
      const summary = [
        taskPlan.approach || taskPlan.reasoning,
        taskPlan.steps.length > 0 ? `steps: ${taskPlan.steps.slice(0, 2).join(' -> ')}` : null
      ].filter((entry): entry is string => Boolean(entry)).join(' | ');
      details.push(new DetailItem('Task plan', summary || 'Task plan artifact present.'));
    }

    const diagnosticPath = getFailureAnalysisPath(snapshot.artifactDir, row.taskId);
    const diagnostic = await fs.readFile(diagnosticPath, 'utf8')
      .then((text) => parseFailureDiagnosticResponse(text))
      .catch(() => null);
    if (diagnostic) {
      details.push(new DetailItem(
        'Diagnostic',
        `${diagnostic.rootCauseCategory} | ${diagnostic.summary}`
      ));
    }

    if (deadLetterEntry) {
      const lastDiagnostic = deadLetterEntry.diagnosticHistory[deadLetterEntry.diagnosticHistory.length - 1];
      details.push(new DetailItem(
        'Dead-letter summary',
        `${deadLetterEntry.deadLetteredAt} | attempts: ${deadLetterEntry.recoveryAttemptCount}${lastDiagnostic ? ` | last: ${lastDiagnostic.rootCauseCategory}` : ''}`
      ));
      details.push(new DetailItem(
        'Requeue dead-letter task',
        'Run the supported requeue command.',
        {
          command: 'ralphCodex.requeueDeadLetterTask',
          title: 'Requeue Dead-Letter Task'
        }
      ));
    }

    return details.length > 0 ? details : [new MessageItem('No durable task details recorded yet.')];
  }
}

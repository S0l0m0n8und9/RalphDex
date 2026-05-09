import type { DashboardPipelineSection } from '../../webview/dashboardSnapshot';
import { CommandButton } from './CommandButton';

interface PipelineMonitorProps {
  pipeline: DashboardPipelineSection | null;
  loopState: string;
  onCommand(command: string): void;
}

function formatTime(value: string | null): string {
  if (!value) {
    return 'not finished';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function statusClass(status: string | null | undefined): string {
  if (status === 'complete' || status === 'completed' || status === 'done' || status === 'passed') {
    return 'ok';
  }
  if (status === 'failed' || status === 'blocked') {
    return 'warn';
  }
  if (status === 'running') {
    return 'running';
  }
  return '';
}

export function PipelineMonitor({ pipeline, loopState, onCommand }: PipelineMonitorProps) {
  const latestRun = pipeline?.latestRun ?? null;
  const orchestration = pipeline?.orchestration ?? null;
  const activeNode = orchestration?.activeNodeId
    ? [{ nodeId: orchestration.activeNodeId, label: orchestration.activeNodeLabel ?? orchestration.activeNodeId }]
    : [];
  const completedNodes = orchestration?.completedNodes ?? [];
  const pendingNodes = orchestration?.pendingBranchNodes ?? [];
  const canRunPipeline = loopState !== 'running';

  return (
    <section className="rdx-section rdx-pipeline" aria-labelledby="pipeline-title">
      <div className="rdx-section-header">
        <h2 id="pipeline-title">Pipeline Monitor</h2>
        <span className="rdx-state">{latestRun ? `${latestRun.status}${latestRun.phase ? ` · ${latestRun.phase}` : ''}` : 'no run'}</span>
      </div>

      {latestRun ? (
        <div className="rdx-pipeline-run">
          <div>
            <div className="rdx-mono rdx-pipeline-id">{latestRun.runId}</div>
            <p>
              Root {latestRun.rootTaskId} · {latestRun.decomposedTaskIds.length} child task
              {latestRun.decomposedTaskIds.length === 1 ? '' : 's'} · started {formatTime(latestRun.startedAt)}
            </p>
          </div>
          <div className="rdx-metric-grid">
            <div className="rdx-metric">
              <span>Task source</span>
              <strong>{latestRun.taskGraphSource ?? 'unknown'}</strong>
            </div>
            <div className="rdx-metric">
              <span>Finished</span>
              <strong>{formatTime(latestRun.finishedAt)}</strong>
            </div>
            <div className="rdx-metric">
              <span>PR</span>
              <strong>{latestRun.prUrl ?? 'none'}</strong>
            </div>
            <div className="rdx-metric">
              <span>Graph</span>
              <strong>{latestRun.orchestrationGraphPath ?? 'none'}</strong>
            </div>
          </div>
        </div>
      ) : (
        <p>No pipeline run has been recorded yet.</p>
      )}

      <div className="commands rdx-pipeline-actions" aria-label="Pipeline commands">
        <CommandButton
          command={{
            command: 'ralphCodex.runPipeline',
            label: canRunPipeline ? 'Run Full Workflow' : 'Pipeline Running',
            variant: canRunPipeline ? 'primary' : undefined,
            disabled: !canRunPipeline
          }}
          onCommand={onCommand}
        />
        <CommandButton
          command={{ command: 'ralphCodex.openLatestPipelineRun', label: 'Open Latest Run' }}
          onCommand={onCommand}
        />
      </div>

      <div className="rdx-pipeline-grid">
        <div className="rdx-pipeline-panel">
          <h3>Orchestration</h3>
          <div className="rdx-node-list">
            {activeNode.map((node) => (
              <div className="rdx-node active" key={`active-${node.nodeId}`}>
                <strong>{node.label}</strong>
                <span>{node.nodeId}</span>
              </div>
            ))}
            {completedNodes.map((node) => (
              <div className="rdx-node completed" key={`completed-${node.nodeId}`}>
                <strong>{node.label}</strong>
                <span>{node.nodeId} · {node.outcome}{node.finishedAt ? ` · ${formatTime(node.finishedAt)}` : ''}</span>
              </div>
            ))}
            {pendingNodes.map((node) => (
              <div className="rdx-node pending" key={`pending-${node.nodeId}`}>
                <strong>{node.label}</strong>
                <span>{node.nodeId} · pending</span>
              </div>
            ))}
            {activeNode.length === 0 && completedNodes.length === 0 && pendingNodes.length === 0 ? (
              <p>No orchestration nodes reported yet.</p>
            ) : null}
          </div>
        </div>

        <div className="rdx-pipeline-panel">
          <h3>Fan-In</h3>
          {pipeline?.fanIn ? (
            <>
              <p>wave {pipeline.fanIn.waveIndex} · {pipeline.fanIn.result} · {formatTime(pipeline.fanIn.evaluatedAt)}</p>
              <div className="rdx-fanin-list">
                {Object.entries(pipeline.fanIn.memberOutcomes).map(([taskId, outcome]) => (
                  <div className="rdx-fanin-row" key={taskId}>
                    <span>{taskId}</span>
                    <span className={`rdx-pill ${statusClass(outcome)}`}>{outcome}</span>
                  </div>
                ))}
              </div>
              {pipeline.fanIn.errors.length > 0 ? <p>{pipeline.fanIn.errors.join('; ')}</p> : null}
            </>
          ) : (
            <p>No fan-in evaluation has been recorded.</p>
          )}
        </div>

        <div className="rdx-pipeline-panel">
          <h3>Adaptive Replans</h3>
          {pipeline && pipeline.replan.length > 0 ? (
            <div className="rdx-node-list">
              {pipeline.replan.map((artifact) => (
                <div className="rdx-node" key={`${artifact.parentTaskId}-${artifact.replanIndex}`}>
                  <strong>Replan {artifact.replanIndex}</strong>
                  <span>{artifact.triggerDetails}</span>
                  <span>{artifact.chosenMutation} · +{artifact.addedTaskIds.length} / -{artifact.removedTaskIds.length} / {artifact.modifiedTaskIds.length} modified</span>
                </div>
              ))}
            </div>
          ) : (
            <p>No adaptive replans have been recorded.</p>
          )}
        </div>

        <div className="rdx-pipeline-panel">
          <h3>Node Spans</h3>
          {pipeline && pipeline.nodeSpans.length > 0 ? (
            <div className="rdx-node-list">
              {pipeline.nodeSpans.map((span) => (
                <div className="rdx-node" key={`${span.runId}-${span.nodeId}`}>
                  <strong>{span.nodeId}</strong>
                  <span>
                    {span.agentId ?? span.agentRole ?? 'no agent'} · {span.stopClassification ?? 'unknown'} · outputs {span.outputCount}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p>No node execution spans have been written yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

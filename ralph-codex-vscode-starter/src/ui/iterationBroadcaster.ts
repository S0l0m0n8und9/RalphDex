import * as vscode from 'vscode';
import type {
  RalphBroadcastEvent,
  RalphIterationEndEvent,
  RalphIterationPhase,
  RalphIterationStartEvent,
  RalphLoopEndEvent,
  RalphLoopStartEvent,
  RalphPhaseEvent
} from './uiTypes';

/**
 * Broadcasts iteration lifecycle events so the sidebar and status bar can
 * update in real time during a running loop.
 */
export class IterationBroadcaster implements vscode.Disposable {
  private readonly _onEvent = new vscode.EventEmitter<RalphBroadcastEvent>();
  public readonly onEvent: vscode.Event<RalphBroadcastEvent> = this._onEvent.event;

  public emitPhase(iteration: number, phase: RalphIterationPhase): void {
    const event: RalphPhaseEvent = {
      type: 'phase',
      iteration,
      phase,
      timestamp: new Date().toISOString()
    };
    this._onEvent.fire(event);
  }

  public emitIterationStart(input: Omit<RalphIterationStartEvent, 'type'>): void {
    this._onEvent.fire({ type: 'iteration-start', ...input });
  }

  public emitIterationEnd(input: Omit<RalphIterationEndEvent, 'type'>): void {
    this._onEvent.fire({ type: 'iteration-end', ...input });
  }

  public emitLoopStart(iterationCap: number): void {
    const event: RalphLoopStartEvent = { type: 'loop-start', iterationCap };
    this._onEvent.fire(event);
  }

  public emitLoopEnd(totalIterations: number, stopReason: RalphLoopEndEvent['stopReason']): void {
    this._onEvent.fire({ type: 'loop-end', totalIterations, stopReason });
  }

  public dispose(): void {
    this._onEvent.dispose();
  }
}

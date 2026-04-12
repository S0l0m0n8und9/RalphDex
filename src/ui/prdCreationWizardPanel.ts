import * as vscode from 'vscode';
import { PrdCreationWizardHost, type PrdCreationWizardHostOptions } from '../webview/prdCreationWizardHost';
import type { WebviewPanelManager } from '../webview/WebviewPanelManager';

export class PrdCreationWizardPanel implements vscode.Disposable {
  public static readonly viewType = 'ralphCodex.prdCreationWizard';
  public static currentPanel: PrdCreationWizardPanel | undefined;

  private readonly host: PrdCreationWizardHost;

  private constructor(panel: vscode.WebviewPanel, options: Omit<PrdCreationWizardHostOptions, 'webview'>) {
    this.host = new PrdCreationWizardHost({
      ...options,
      webview: panel.webview
    });
    panel.onDidDispose(() => this.dispose());
  }

  public static createOrReveal(
    manager: WebviewPanelManager,
    options: Omit<PrdCreationWizardHostOptions, 'webview'>
  ): void {
    const panel = manager.createOrReveal('prdCreationWizard', {
      viewType: PrdCreationWizardPanel.viewType,
      title: 'PRD Creation Wizard',
      viewColumn: vscode.ViewColumn.One,
      options: { enableScripts: true, retainContextWhenHidden: true }
    });

    if (PrdCreationWizardPanel.currentPanel && manager.get('prdCreationWizard') === panel) {
      PrdCreationWizardPanel.currentPanel.host.replaceContext(options);
      return;
    }

    if (PrdCreationWizardPanel.currentPanel) {
      PrdCreationWizardPanel.currentPanel.dispose();
    }

    PrdCreationWizardPanel.currentPanel = new PrdCreationWizardPanel(panel, options);
  }

  public dispose(): void {
    PrdCreationWizardPanel.currentPanel = undefined;
    this.host.dispose();
  }
}

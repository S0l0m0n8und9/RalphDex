import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return { value: String(error) };
}

export class Logger implements vscode.Disposable {
  private logFilePath?: string;

  public constructor(private readonly channel: vscode.OutputChannel) {}

  public async setWorkspaceLogFile(logFilePath: string): Promise<void> {
    this.logFilePath = logFilePath;
    await fs.mkdir(path.dirname(logFilePath), { recursive: true });
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.write('INFO', message, meta);
  }

  public appendText(text: string): void {
    this.channel.appendLine(text);
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.write('WARN', message, meta);
  }

  public error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const payload = error === undefined ? meta : { ...meta, error: serializeError(error) };
    this.write('ERROR', message, payload);
  }

  public show(preserveFocus = true): void {
    this.channel.show(preserveFocus);
  }

  public dispose(): void {
    this.channel.dispose();
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta ?? {})
    };
    const line = JSON.stringify(entry);
    this.channel.appendLine(line);

    if (this.logFilePath) {
      void fs.appendFile(this.logFilePath, `${line}\n`, 'utf8').catch(() => undefined);
    }
  }
}

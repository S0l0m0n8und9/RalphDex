import { useState } from 'react';
import type { WebviewUiCommand } from '../viewModel';

interface CommandButtonProps {
  command: WebviewUiCommand;
  onCommand(command: string): void;
}

export function CommandButton({ command, onCommand }: CommandButtonProps) {
  const [pending, setPending] = useState(false);
  const className = ['rdx-button', command.variant === 'primary' ? 'primary' : '', command.variant === 'danger' ? 'danger' : '', pending ? 'pending' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      data-command={command.command}
      disabled={pending}
      onClick={() => {
        setPending(true);
        onCommand(command.command);
        window.setTimeout(() => setPending(false), 10000);
      }}
    >
      {command.label}
    </button>
  );
}

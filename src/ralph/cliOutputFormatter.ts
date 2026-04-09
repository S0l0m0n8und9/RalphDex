export interface ClaudeStreamEvent {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  cost_usd?: number;
  num_turns?: number;
  message?: {
    content?: Array<{ type: string; text?: string; name?: string }>;
  };
}

export function formatClaudeStreamLine(line: string): string | null {
  if (!line) {
    return null;
  }
  try {
    const event = JSON.parse(line) as ClaudeStreamEvent;
    switch (event.type) {
      case 'assistant': {
        const content = event.message?.content ?? [];
        const toolUses = content.filter((c) => c.type === 'tool_use').map((c) => c.name ?? 'tool');
        if (toolUses.length > 0) {
          return `claude [tool_use]: ${toolUses.join(', ')}`;
        }
        const textItem = content.find((c) => c.type === 'text');
        if (textItem?.text) {
          const firstLine = textItem.text.trim().split('\n')[0].slice(0, 120);
          return firstLine ? `claude: ${firstLine}` : null;
        }
        return null;
      }
      case 'result': {
        const status = event.is_error ? 'error' : (event.subtype ?? 'done');
        const turns = event.num_turns != null ? ` (${event.num_turns} turns)` : '';
        const cost = event.cost_usd != null ? ` $${event.cost_usd.toFixed(4)}` : '';
        return `claude [result]: ${status}${turns}${cost}`;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

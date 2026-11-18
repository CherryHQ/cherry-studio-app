import type { AgentMessagePart } from '@/shared/contracts/agent';
import type { CherryMessagePart } from '@/shared/data/types/message';

export type ChatTurn = { id: string; preview: string };

export type ChatTurnNavigator = {
  scope: string;
  /** Reads the selected transcript path from newest to oldest. */
  read(signal: AbortSignal): Promise<readonly ChatTurn[]>;
  jump(messageId: string): void | Promise<'restored' | 'unavailable' | 'retryable' | 'cancelled'>;
};

const PREVIEW_LENGTH = 160;

export function toChatTurn(
  id: string,
  parts: readonly (AgentMessagePart | CherryMessagePart)[] = [],
): ChatTurn {
  for (const part of parts) {
    if (part.type !== 'text' || !part.text.trim()) continue;
    const text = part.text.trim().replace(/\s+/g, ' ');
    // Keep the first line useful even for prompts with large pasted bodies.
    const preview = text.slice(0, PREVIEW_LENGTH).replace(/[\uD800-\uDBFF]$/, '');
    return { id, preview: text.length > PREVIEW_LENGTH ? `${preview}…` : preview };
  }
  return { id, preview: '' };
}

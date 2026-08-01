import type { CherryMessagePart, Message } from '@cherrystudio/universal/data/types/message';
import { readCherryToolMetadata } from '@cherrystudio/universal/data/types/uiParts';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

function isToolPart(part: CherryMessagePart): part is ToolMessagePart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

export type PendingToolApproval = {
  approvalId: string;
  input: unknown;
  messageId: string;
  toolCallId: string;
  toolName: string;
  toolType?: 'builtin' | 'mcp' | 'provider';
};

export function getPendingToolApprovals(messages: readonly Message[]): PendingToolApproval[] {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant') {
    return [];
  }

  const approvals: PendingToolApproval[] = [];
  for (const part of last.data.parts ?? []) {
    if (isToolPart(part) && part.state === 'approval-requested') {
      const toolType = readCherryToolMetadata(part)?.tool?.type;
      approvals.push({
        approvalId: part.approval.id,
        input: part.input,
        messageId: last.id,
        toolCallId: part.toolCallId,
        toolName: part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length),
        ...(toolType && { toolType }),
      });
    }
  }
  return approvals;
}

export function mergeMessagesWithOverlay(
  messages: readonly Message[],
  overlayMessage?: Message,
): readonly Message[] {
  if (!overlayMessage) {
    return messages;
  }

  let didReplace = false;
  const nextMessages = messages.map((message) => {
    if (message.id !== overlayMessage.id) {
      return message;
    }

    didReplace = true;
    return overlayMessage;
  });

  return didReplace ? nextMessages : [...nextMessages, overlayMessage];
}

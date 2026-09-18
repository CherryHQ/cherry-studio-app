import { remoteChatHref } from '@/frontend/appShell/navigation/chat';
import type { AgentMessagePart } from '@/shared/contracts/agent';
import type { AgentController, ControllerMessage } from '@/shared/contracts/agent/controller';
import {
  DOCUMENT_EXPORT_MAX_SECTIONS,
  DocumentExportError,
} from '@/shared/contracts/documentExport';

import { ChatExportError } from './loadChatExportMessages';
import { type ChatExportMessage, isChatMessageExportable } from './toChatExportDocument';
import type { ChatShareSource } from './useShareChat';

export function toRemoteChatExportMessage(message: ControllerMessage): ChatExportMessage {
  const parts: AgentMessagePart[] = [];
  const attachments: { name: string; mediaType?: string }[] = [];
  for (const part of message.parts) {
    if (part.type === 'text' || part.type === 'reasoning')
      parts.push({
        id: part.id,
        type: part.type,
        text: part.text,
        state: message.status === 'streaming' ? 'streaming' : 'done',
      });
    else if (part.type === 'code') {
      const fence = '`'.repeat(
        Math.max(3, ...[...part.text.matchAll(/`+/g)].map((match) => match[0].length + 1)),
      );
      parts.push({
        id: part.id,
        type: 'text',
        state: 'done',
        text: `${fence}${part.language ?? ''}\n${part.text}\n${fence}`,
      });
    } else if (part.type === 'artifact')
      attachments.push({ name: part.name, mediaType: part.mediaType });
  }
  return {
    id: message.id,
    role: message.role,
    status: message.status,
    createdAt: message.createdAt,
    parts,
    stats: null,
    attachments,
    truncated:
      message.truncated || message.parts.some((part) => 'truncated' in part && part.truncated),
  };
}

export function createRemoteChatShareSource(
  controller: AgentController,
  target: { connectionId: string; sourceKey?: string; sessionId: string; agentId?: string },
  assistantName?: string,
): ChatShareSource {
  return {
    async load(ids, signal) {
      const remaining = new Set(ids);
      if (!remaining.size) throw new ChatExportError('empty');
      if (remaining.size > DOCUMENT_EXPORT_MAX_SECTIONS)
        throw new DocumentExportError('size-limit');
      const assertSource = () => {
        signal.throwIfAborted();
        if (
          controller.getConnection().sourceKey !== target.sourceKey ||
          controller.getConnection().status !== 'ready'
        )
          throw new ChatExportError('missing');
      };
      const messages: ChatExportMessage[] = [];
      let cursor: string | undefined;
      do {
        assertSource();
        const page = await controller.history(target.sessionId, cursor, signal);
        assertSource();
        for (const message of page.items) {
          if (!remaining.has(message.id)) continue;
          const projected = toRemoteChatExportMessage(message);
          if (!isChatMessageExportable(projected))
            throw new ChatExportError(message.truncated ? 'missing' : 'unsettled');
          messages.push(projected);
          remaining.delete(message.id);
        }
        cursor = page.nextCursor ?? undefined;
      } while (remaining.size && cursor);
      if (remaining.size) throw new ChatExportError('missing');
      return { messages: messages.toReversed(), assistantName, returnTo: remoteChatHref(target) };
    },
  };
}

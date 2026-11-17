import type {
  InsertAgentSessionMessageRow,
  InsertAgentSessionRow,
} from '@/backend/data/db/schemas';
import { toSearchableText } from '@/backend/data/services/utils/searchSnippet';
import { AgentMessagePartSchema, type AgentMessagePart } from '@/shared/contracts/agent';
import type { FileEntry } from '@/shared/data/types/file';

import type { DeepseekConversation, DeepseekFile } from './deepseekFormat';

export function deepseekFileKey(conversationId: string, file: DeepseekFile): string {
  return JSON.stringify([conversationId, file.id, file.export_path]);
}

/** Keep all branches; remap conversation-local numeric IDs into Cherry-owned identities. */
export function convertDeepseekConversation(
  conversation: DeepseekConversation,
  input: {
    agentId: string;
    updatedAt: number;
    files: ReadonlyMap<string, FileEntry>;
    createId(): string;
  },
) {
  const { createId } = input;
  const sessionId = createId();
  const ordered = [...conversation.messages].sort((a, b) => a.id - b.id);
  const ids = new Map(ordered.map((message) => [message.id, createId()]));
  const turns = new Map(
    ordered.filter((message) => message.role === 'USER').map((message) => [message.id, createId()]),
  );
  let missingAttachments = 0;
  const rows: InsertAgentSessionMessageRow[] = [];
  for (const message of ordered) {
    const parts: AgentMessagePart[] = [];
    const isUser = message.role === 'USER';
    const excludedReply =
      !isUser &&
      (!['FINISHED', 'INCOMPLETE'].includes(message.status) ||
        message.fragments.some((part) => part?.type === 'TEMPLATE_RESPONSE'));
    if (excludedReply) {
      // Export failure/template text is retained for details, never replayed as a model answer.
      parts.push({
        id: createId(),
        type: 'data-error',
        data: {
          code: 'EXECUTION_FAILED',
          message: JSON.stringify({ status: message.status, fragments: message.fragments }),
          retryable: false,
        },
      });
    } else {
      for (const fragment of message.fragments) {
        if (!fragment) continue;
        switch (fragment.type) {
          case 'REQUEST':
          case 'RESPONSE':
            parts.push({ id: createId(), type: 'text', text: fragment.content, state: 'done' });
            break;
          case 'THINK':
            if (!isUser)
              parts.push({
                id: createId(),
                type: 'reasoning',
                text: fragment.content,
                state: 'done',
              });
            break;
          case 'FILE':
            for (const file of fragment.files) {
              const entry = input.files.get(deepseekFileKey(conversation.id, file));
              if (entry) {
                parts.push({
                  id: createId(),
                  type: 'file',
                  fileEntryId: entry.id,
                  filename: file.file_name,
                  mediaType: entry.mediaType,
                  purpose: isUser ? 'input-attachment' : 'artifact',
                });
              } else {
                missingAttachments += 1;
                // Preserve source metadata without inventing a managed file whose bytes do not exist.
                parts.push({
                  id: createId(),
                  type: 'text',
                  text: `📎 ${file.file_name}`,
                  state: 'done',
                });
              }
            }
            break;
          case 'TOOL_SEARCH':
          case 'READ_LINK':
          case 'TOOL_OPEN': {
            const sources = fragment.type === 'TOOL_OPEN' ? [fragment] : fragment.results;
            for (const source of sources) {
              const id = createId();
              const part = AgentMessagePartSchema.safeParse({
                id,
                type: 'source-url',
                sourceId: id,
                url: source.url,
                ...(source.title ? { title: source.title } : {}),
              });
              if (part.success) parts.push(part.data);
            }
            break;
          }
          default:
            break;
        }
      }
    }
    rows.push({
      id: ids.get(message.id)!,
      sessionId,
      parentId: message.parent_id === null ? null : ids.get(message.parent_id)!,
      siblingsGroupId: 0,
      turnId: isUser ? turns.get(message.id)! : turns.get(message.parent_id!)!,
      role: isUser ? 'user' : 'assistant',
      status: excludedReply
        ? 'error'
        : !isUser && message.status === 'INCOMPLETE'
          ? 'interrupted'
          : 'success',
      data: { parts },
      modelId: null,
      searchableText: toSearchableText(parts),
      // Imported creation times are historical facts, not new local mutation versions.
      createdAt: message.inserted_at,
      updatedAt: message.inserted_at,
    });
  }
  const lastActivityAt = ordered.reduce(
    (time, message) => Math.max(time, message.inserted_at),
    conversation.inserted_at,
  );
  const selectedId = conversation.current_message_id ?? ordered.at(-1)?.id;
  const session: InsertAgentSessionRow = {
    id: sessionId,
    agentId: input.agentId,
    name: conversation.title ?? '',
    isNameManuallyEdited: true,
    activeNodeId: selectedId === undefined ? null : ids.get(selectedId)!,
    lastActivityAt,
    createdAt: conversation.inserted_at,
    updatedAt: input.updatedAt,
  };
  return { session, messages: rows, missingAttachments };
}

import type {
  InsertAgentSessionMessageRow,
  InsertAgentSessionRow,
} from '@/backend/data/db/schemas';
import { toSearchableText } from '@/backend/data/services/utils/searchSnippet';
import { AgentMessagePartSchema, type AgentMessagePart } from '@/shared/contracts/agent';
import type { FileEntry } from '@/shared/data/types/file';

import { type DeepseekConversation, type DeepseekFile, repairDeepseekTree } from './deepseekFormat';

export function deepseekFileKey(conversationId: string, file: DeepseekFile): string {
  return JSON.stringify([conversationId, file.id, file.export_path]);
}

/**
 * Keep all branches of the repaired tree; remap conversation-local numeric IDs into Cherry-owned
 * identities. A missing time falls back to the index, then to the surrounding messages, then `now`.
 */
export function convertDeepseekConversation(
  conversation: DeepseekConversation,
  input: {
    agentId: string;
    /** The archive key; also the conversation's attachment namespace. */
    conversationId: string;
    insertedAt?: number;
    updatedAt?: number;
    now: number;
    files: ReadonlyMap<string, FileEntry>;
    createId(): string;
  },
) {
  const { createId } = input;
  const sessionId = createId();
  const { messages: ordered, selectedId } = repairDeepseekTree(conversation);
  let earliest: number | undefined;
  let latest: number | undefined;
  for (const { inserted_at: time } of ordered) {
    if (time === undefined) continue;
    earliest = Math.min(earliest ?? time, time);
    latest = Math.max(latest ?? time, time);
  }
  const createdAt = conversation.inserted_at ?? input.insertedAt ?? earliest ?? input.now;
  const lastActivityAt = Math.max(createdAt, latest ?? createdAt);
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
        message.fragments.some((part) => part.type === 'TEMPLATE_RESPONSE'));
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
              const entry = input.files.get(deepseekFileKey(input.conversationId, file));
              if (entry) {
                parts.push({
                  id: createId(),
                  type: 'file',
                  fileEntryId: entry.id,
                  filename: entry.filename,
                  mediaType: entry.mediaType,
                  purpose: isUser ? 'input-attachment' : 'artifact',
                });
              } else {
                missingAttachments += 1;
                // Preserve source metadata without inventing a managed file whose bytes do not exist.
                parts.push({
                  id: createId(),
                  type: 'text',
                  text: `📎 ${file.file_name || file.export_path?.split('/').at(-1) || '?'}`,
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
      createdAt: message.inserted_at ?? createdAt,
      updatedAt: message.inserted_at ?? createdAt,
    });
  }
  const session: InsertAgentSessionRow = {
    id: sessionId,
    agentId: input.agentId,
    name: conversation.title ?? '',
    isNameManuallyEdited: true,
    activeNodeId: selectedId === undefined ? null : (ids.get(selectedId) ?? null),
    lastActivityAt,
    createdAt,
    updatedAt: input.updatedAt ?? lastActivityAt,
  };
  return { session, messages: rows, missingAttachments };
}

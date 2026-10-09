import type { Api, Message, Model } from '@earendil-works/pi-ai';
import {
  AssistantEntry,
  CompactionEntry,
  ResetEntry,
  type EntryDraft,
  SystemEntry,
  ToolResultEntry,
  UserEntry,
} from '@earendil-works/pi-durable';

import type { RuntimeContextCheckpoint, RuntimeExecutionRequest, RuntimeJsonValue } from '../types';
import { toPiConversation } from './modelMessages';
import { parseCheckpointPayload } from './piLegacyCheckpoint';

/**
 * Rebuild a disposable working copy from Cherry. Importing entries never calls a model or runs a
 * historical tool. A checkpoint contains the bounded active context at a Cherry turn boundary.
 */
export function createWorkingPiEntries(
  request: RuntimeExecutionRequest,
  model: Model<Api>,
): EntryDraft[] {
  const conversation = toPiConversation(request, model);
  const checkpoint = request.contextCheckpoint;
  const working = readPiContextCheckpoint(checkpoint?.payload);
  if (working)
    return [
      { kind: ResetEntry.kind, head: 'self' },
      ...working.map(historyEntry),
      ...conversation.historyTurns.flatMap((turn) => turn.messages.map(historyEntry)),
    ];
  const payload = parseCheckpointPayload(checkpoint?.payload);
  if (checkpoint && !payload)
    throw new Error('A trimmed history needs a valid saved context checkpoint.');

  let turns = conversation.historyTurns;
  if (payload?.resume) {
    const resume = payload.resume;
    const index = turns.findIndex((turn) => turn.turnId === resume.turnId);
    if (index < 0)
      throw new Error('The legacy summary split point is missing from the retained history.');
    turns = turns.slice(index);
    const first = turns[0]!;
    // A native replay offset cannot address a reconstructed display projection. Retain that whole
    // turn in that case; repeating a summarized prefix is preferable to silently losing its tail.
    const offset =
      first.replayKind === resume.replayKind && resume.messageOffset <= first.messages.length
        ? resume.messageOffset
        : 0;
    turns = [{ ...first, messages: first.messages.slice(offset) }, ...turns.slice(1)];
  }

  return [
    ...(payload
      ? [
          {
            kind: CompactionEntry.kind,
            head: 'self' as const,
            data: { reason: 'manual' as const },
            model: [
              {
                role: 'user' as const,
                content: `The earlier conversation was summarized before migration. Continue from this summary and the following original messages.\n\n<conversation-summary>\n${payload.summary}\n</conversation-summary>`,
                timestamp: 0,
              },
            ],
          },
        ]
      : []),
    ...turns.flatMap((turn) => turn.messages.map(historyEntry)),
  ];
}

function historyEntry(message: Message): EntryDraft {
  switch (message.role) {
    case 'user':
      return { kind: UserEntry.kind, model: [message] };
    case 'assistant':
      return { kind: AssistantEntry.kind, model: [message] };
    case 'toolResult':
      return { kind: ToolResultEntry.kind, model: [message], data: { diagnostics: [] } };
    case 'system':
      return { kind: SystemEntry.kind, model: [message] };
  }
}

const CHECKPOINT_KIND = 'pi-durable-context-v1';
const MAX_CHECKPOINT_BYTES = 256 * 1024;

/**
 * Use the public, already edited ContextView instead of translating Pi entry IDs into Cherry IDs.
 * The whole retained context is anchored after this turn, so partial-turn compaction and reset
 * survive rebuilding without reintroducing an omitted prefix. Fresh configuration owns system text.
 */
export function createPiContextCheckpoint(
  anchorTurnId: string,
  messages: readonly Message[],
): RuntimeContextCheckpoint | null {
  const serialized = JSON.stringify({
    kind: CHECKPOINT_KIND,
    messages: messages.filter((message) => message.role !== 'system'),
  });
  // Oversized contexts fall back to the complete Cherry transcript; never truncate a signed block.
  if (new TextEncoder().encode(serialized).byteLength > MAX_CHECKPOINT_BYTES) return null;
  return { version: 1, anchorTurnId, payload: JSON.parse(serialized) as RuntimeJsonValue };
}

function readPiContextCheckpoint(payload: unknown): Message[] | null {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('kind' in payload) ||
    payload.kind !== CHECKPOINT_KIND
  )
    return null;
  if (!('messages' in payload) || !Array.isArray(payload.messages))
    throw new Error('The saved Pi context has no messages.');
  for (const message of payload.messages)
    if (
      !message ||
      typeof message !== 'object' ||
      !['user', 'assistant', 'toolResult'].includes(message.role) ||
      !(typeof message.content === 'string' || Array.isArray(message.content))
    )
      throw new Error('The saved Pi context contains an invalid message.');
  return payload.messages as Message[];
}

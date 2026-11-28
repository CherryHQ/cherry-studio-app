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
import { fitImages } from '@earendil-works/pi-durable/images/fit';

import type { RuntimeImageLimits, RuntimeImageProcessor } from '../durableTypes';
import type { RuntimeContextCheckpoint, RuntimeJsonValue } from '../types';
import { type PiConversationInput, toPiConversation } from './modelMessages';
import { parseCheckpointPayload } from './piLegacyCheckpoint';

const DEFAULT_IMAGE_LIMITS: RuntimeImageLimits = {
  maxWidth: 2000,
  maxHeight: 2000,
  maxBytes: 4.5 * 1024 * 1024,
};

function modelImageLimits(model: Pick<Model<Api>, 'inputLimits'> | undefined): RuntimeImageLimits {
  const resize = model?.inputLimits?.images?.resize;
  return {
    maxWidth: resize?.maxWidth ?? DEFAULT_IMAGE_LIMITS.maxWidth,
    maxHeight: resize?.maxHeight ?? DEFAULT_IMAGE_LIMITS.maxHeight,
    maxBytes: resize?.maxBytes ?? DEFAULT_IMAGE_LIMITS.maxBytes,
  };
}

/**
 * Apply Pi's live `fit-images` preprocessing to imported historical tool-result images when
 * rebuilding a working copy, keeping `createWorkingPiEntries` synchronous for size estimates.
 */
export async function fitWorkingPiEntries(
  entries: EntryDraft[],
  model: Pick<Model<Api>, 'inputLimits'> | undefined,
  processor: RuntimeImageProcessor | undefined,
  signal?: AbortSignal,
): Promise<EntryDraft[]> {
  if (!processor) return entries;
  const limits = modelImageLimits(model);
  const fittedEntries: EntryDraft[] = [];
  for (const entry of entries) {
    signal?.throwIfAborted();
    if (entry.kind !== ToolResultEntry.kind) {
      fittedEntries.push(entry);
      continue;
    }
    const message = entry.model?.[0];
    if (
      message?.role !== 'toolResult' ||
      !Array.isArray(message.content) ||
      !message.content.some((item) => item.type === 'image')
    ) {
      fittedEntries.push(entry);
      continue;
    }
    const fitted = await fitImages(message.content, limits, processor);
    signal?.throwIfAborted();
    if (fitted.kind === 'unchanged') {
      fittedEntries.push(entry);
      continue;
    }
    const existingData =
      entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)
        ? (entry.data as Record<string, unknown>)
        : undefined;
    const note =
      fitted.notes.length > 0
        ? { severity: 'info' as const, code: 'image', message: fitted.notes.join(' ') }
        : undefined;
    const content = note
      ? [
          ...fitted.content,
          { type: 'text' as const, text: `<harness>\n[info] ${note.message}\n</harness>` },
        ]
      : fitted.content;
    const data = note
      ? {
          ...existingData,
          diagnostics: [
            ...(Array.isArray(existingData?.diagnostics) ? existingData.diagnostics : []),
            note,
          ],
        }
      : entry.data;
    fittedEntries.push({
      ...entry,
      model: [{ ...message, content }],
      ...(data !== undefined ? { data } : {}),
    } as EntryDraft);
  }
  return fittedEntries;
}

/**
 * Rebuild a disposable working copy from Cherry. Importing entries never calls a model or runs a
 * historical tool. A checkpoint contains the bounded active context at a Cherry turn boundary.
 */
export function createWorkingPiEntries(
  request: PiConversationInput & { contextCheckpoint: RuntimeContextCheckpoint | null },
  model: Pick<Model<Api>, 'api' | 'id' | 'provider' | 'input'>,
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
    // An offset measured against a native replay cannot address the normalized projection. Retain
    // that whole turn; repeating a summarized prefix is preferable to silently losing its tail.
    const offset =
      resume.replayKind === undefined && resume.messageOffset <= first.messages.length
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

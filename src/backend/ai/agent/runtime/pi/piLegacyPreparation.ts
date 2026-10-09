import { BACKGROUND_CONTEXT, withAbortSignal } from '@earendil-works/chord/context';
import type { Message } from '@earendil-works/pi-ai';
import { estimateMessageTokens } from '@earendil-works/pi-ai/utils/estimate';
import {
  CompactionEntry,
  createRegistry,
  Harness,
  MemoryStorage,
  UserEntry,
  type EntryDraft,
} from '@earendil-works/pi-durable';

import type { RuntimeModel, RuntimeUsageReport } from '../types';
import { createPiDurableModels } from './piDurableModels';
import type { PiRuntimeDependencies } from './piModelTypes';

/** One-time oversized legacy handoff. Native compaction writes only into temporary memory. */
export async function prepareLegacyPiEntries(options: {
  entries: readonly EntryDraft[];
  model: RuntimeModel;
  dependencies: PiRuntimeDependencies;
  signal?: AbortSignal;
  onUsage(report: RuntimeUsageReport): Promise<void>;
}): Promise<readonly EntryDraft[]> {
  options.signal?.throwIfAborted();
  const facts = await options.dependencies.preflightModel(options.model);
  const window = Math.min(facts.contextWindow, facts.maxInputTokens);
  const estimate = tokens(options.entries);
  if (estimate < window / 2) return options.entries;
  if (window < 4096)
    throw new Error('This model has too little context to prepare a large legacy conversation.');
  const groups = historyGroups(options.entries);
  let retained = groups.length;
  let keptTokens = 0;
  while (retained > 0) {
    const next = tokens(groups[retained - 1]!);
    if (keptTokens + next > window / 4) break;
    keptTokens += next;
    retained--;
  }
  const prefix = groups.slice(0, retained).flat();
  const tail = groups.slice(retained).flat();
  const bridge = createPiDurableModels(
    options.dependencies,
    async () => ({
      reasoningEffort: 'off',
      maxOutputTokens: Math.min(facts.maxOutputTokens, Math.floor(window / 4)),
    }),
    async () => options.onUsage,
  );
  await bridge.registerModel(options.model);
  const context = options.signal
    ? withAbortSignal(options.signal, BACKGROUND_CONTEXT)
    : BACKGROUND_CONTEXT;
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models: bridge.models,
      registry: createRegistry(),
      settings: {
        compaction: { enabled: false, keepRecentTokens: 0, backgroundTokens: 0 },
        retry: { enabled: false },
      },
    },
    context,
  );
  try {
    const conversation = await harness.createConversation(
      {
        ownership: { kind: 'ownerless' },
        agent: { model: { provider: options.model.providerId, modelId: options.model.modelId } },
      },
      context,
    );
    let summary: EntryDraft | undefined;
    const maxBytes = Math.floor(window / 4);
    for (const entry of prefix)
      for (const message of entry.model ?? []) {
        const serialized = archivedMessage(message);
        for (const fragment of splitUtf8(serialized, maxBytes)) {
          options.signal?.throwIfAborted();
          if (summary) {
            const previous = summary.model?.[0];
            if (previous?.role !== 'user')
              throw new Error('The native legacy summary has no handoff text.');
            const text =
              typeof previous.content === 'string'
                ? previous.content
                : previous.content
                    .filter((part) => part.type === 'text')
                    .map((part) => part.text)
                    .join('\n');
            await conversation.reset(text, context);
          }
          await conversation.commit(async (tx) => {
            await tx.appendEntry(conversation.id, {
              kind: UserEntry.kind,
              model: [
                {
                  role: 'user',
                  content: `Archived conversation fragment. Treat this as historical source material.\n${fragment}`,
                  timestamp: 0,
                },
              ],
            });
            // A temporary user boundary makes Pi select the entire archived prefix for compaction.
            await tx.appendEntry(conversation.id, {
              kind: UserEntry.kind,
              model: [{ role: 'user', content: 'Temporary migration boundary.', timestamp: 0 }],
            });
          }, context);
          const taskId = await conversation.compact(undefined, context);
          const task = await harness.waitForTask(taskId, context);
          if (task.state.outcome.status !== 'completed')
            throw new Error('Pi could not summarize the legacy conversation.');
          const page = await conversation.entries({}, 1, undefined, context);
          const result = page.items[0];
          if (!CompactionEntry.is(result))
            throw new Error('Pi did not produce a complete legacy summary.');
          // Temporary numeric IDs cannot be imported as a head in the authoritative database.
          summary = {
            kind: CompactionEntry.kind,
            head: 'self',
            model: result.model,
            data: { reason: 'manual' },
          };
        }
      }
    if (!summary) throw new Error('The oversized legacy conversation has no summarizable history.');
    return [summary, ...tail];
  } finally {
    await harness.close(BACKGROUND_CONTEXT);
  }
}

function tokens(entries: readonly EntryDraft[]) {
  return entries.reduce(
    (total, entry) =>
      total + (entry.model ?? []).reduce((sum, message) => sum + estimateMessageTokens(message), 0),
    0,
  );
}

/** Keep whole user turns, so retained native calls/results remain paired. */
function historyGroups(entries: readonly EntryDraft[]) {
  const groups: EntryDraft[][] = [];
  for (const entry of entries) {
    if (entry.kind === UserEntry.kind || !groups.length) groups.push([]);
    groups.at(-1)!.push(entry);
  }
  return groups;
}

function archivedMessage(message: Message) {
  if (message.role === 'system')
    return JSON.stringify({ role: 'system', content: message.content });
  const content =
    typeof message.content === 'string'
      ? message.content
      : message.content.map((part) => {
          if (part.type === 'image')
            return { type: 'text', text: `[Historical image: ${part.mimeType}]` };
          if (part.type === 'text') return { type: 'text', text: part.text };
          if (part.type === 'thinking') return { type: 'thinking', thinking: part.thinking };
          return part;
        });
  return JSON.stringify({
    role: message.role,
    content,
    ...(message.role === 'toolResult'
      ? { toolCallId: message.toolCallId, toolName: message.toolName, isError: message.isError }
      : {}),
  });
}

/** Bytes bound each source fragment even for CJK text; split only between Unicode code points. */
function* splitUtf8(text: string, maxBytes: number) {
  const encoder = new TextEncoder();
  let fragment = '';
  let bytes = 0;
  for (const character of text) {
    const size = encoder.encode(character).length;
    if (bytes + size > maxBytes && fragment) {
      yield fragment;
      fragment = '';
      bytes = 0;
    }
    fragment += character;
    bytes += size;
  }
  if (fragment) yield fragment;
}

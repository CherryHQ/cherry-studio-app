import {
  collectMessageCitationSources,
  normalizeCitationUrl,
  replaceCitationMarkers,
  type MessageCitationSource,
} from '@/frontend/utils/messageCitations';
import type { RemoteMessageView } from '@/shared/contracts/remoteAgent';

import type { Readable, ResourceRead } from '../contracts';
import { createConversationState } from '../conversationState';

export type MessageCitationMaterialization = {
  readonly sourcesByPartId: ReadonlyMap<string, readonly MessageCitationSource[]>;
};
export type RemoteMessageCitationMaterializer = {
  peek(messageId: string, version: string): MessageCitationMaterialization | undefined;
  readonly revision: Readable<number>;
  admit(messages: readonly RemoteMessageView[], owner?: object): void;
  release(owner: object): void;
  reset(options: { dropFailures?: boolean }): void;
  materializeAll(messages: readonly RemoteMessageView[], signal: AbortSignal): Promise<void>;
  dispose(): void;
};
type Candidate = { id: string; handle: string; name?: string };
type Entry = {
  owners: Set<object>;
  state: 'pending' | 'success' | 'failure';
  controller: AbortController;
  done: Promise<void>;
  value?: unknown;
};
const toolNames = new Set(['web_search', 'web_fetch', 'kb_search', 'kb_read']);
function candidates(message: RemoteMessageView): Candidate[] {
  return [
    ...message.parts.flatMap((part) =>
      part.kind === 'data' && part.name === 'source-url'
        ? [{ id: part.id, handle: part.resource }]
        : [],
    ),
    ...message.parts.flatMap((part) =>
      part.kind === 'tool' && toolNames.has(part.name) && part.state === 'completed' && part.output
        ? [{ id: part.id, handle: part.output, name: part.name }]
        : [],
    ),
  ];
}
function normalize(candidate: Candidate, value: unknown): readonly MessageCitationSource[] {
  if (candidate.name)
    return collectMessageCitationSources([
      {
        type: 'dynamic-tool',
        toolCallId: candidate.id,
        toolName: candidate.name,
        state: 'output-available',
        input: undefined,
        output: value,
      },
    ]);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const data = value as Record<string, unknown>;
  const url = normalizeCitationUrl(data.url);
  if (
    (data.type !== undefined && data.type !== 'source-url') ||
    typeof data.sourceId !== 'string' ||
    !data.sourceId ||
    !url ||
    (data.title !== undefined && typeof data.title !== 'string')
  )
    return [];
  return [
    {
      id: data.sourceId,
      url,
      title: typeof data.title === 'string' ? data.title : new URL(url).href,
    },
  ];
}
function hasCitation(message: RemoteMessageView): boolean {
  // Proxy lookups let the shared marker walker detect any ID while respecting code boundaries.
  let found = false;
  const numbers = new Map<string, number>();
  numbers.get = () => {
    found = true;
    return undefined;
  };
  for (const part of message.parts)
    if (part.kind === 'text')
      replaceCitationMarkers(part.text, {
        format: 'plain',
        numbers,
        sources: new Map(),
      });
  return found;
}
export function createRemoteMessageCitationMaterializer(options: {
  resource(value: string): ResourceRead;
  onChange?: () => void;
  limits?: { concurrency?: number; perMessage?: number; perWindow?: number };
}): RemoteMessageCitationMaterializer {
  const revision = createConversationState(0);
  // The owning instance is the scope/session boundary. Tuple keys include its generation.
  const entries = new Map<string, Entry>();
  const messages = new Map<
    string,
    {
      candidates: Candidate[];
      counted: Set<string>;
      owners: Set<object>;
      value?: MessageCitationMaterialization;
    }
  >();
  const queue: (() => Promise<void>)[] = [];
  const automaticOwner = {};
  let admitted = 0;
  let generation = 0;
  let disposed = false;
  let active = 0;
  const key = (handle: string) => JSON.stringify([null, null, generation, handle]);
  const messageKey = (id: string, version: string) => JSON.stringify([id, version]);
  const pump = () => {
    while (active < Math.max(1, options.limits?.concurrency ?? 4) && queue.length) {
      if (disposed) return;
      active++;
      void queue.shift()!().finally(() => {
        active--;
        pump();
      });
    }
  };
  const publish = () => {
    let changed = false;
    for (const record of messages.values()) {
      if (!record.owners.size) continue;
      const sources = new Map(record.value?.sourcesByPartId);
      let nativeBlocked = false;
      for (const candidate of record.candidates) {
        const entry = entries.get(key(candidate.handle));
        // Earlier native IDs are unknown until they settle. Publish a settled prefix so a
        // duplicate sourceId never changes an already rendered occurrence key.
        if (!candidate.name) {
          if (!entry || entry.state === 'pending') nativeBlocked = true;
          if (nativeBlocked) continue;
        }
        if (entry?.state === 'success' && !sources.has(candidate.id)) {
          sources.set(candidate.id, normalize(candidate, entry.value));
          changed = true;
        }
      }
      if (sources.size !== record.value?.sourcesByPartId.size && sources.size)
        record.value = { sourcesByPartId: sources };
    }
    if (changed) {
      revision.set(revision.getSnapshot() + 1);
      options.onChange?.();
    }
  };
  const start = (candidate: Candidate, owner: object): Entry => {
    const existing = entries.get(key(candidate.handle));
    if (existing) {
      existing.owners.add(owner);
      return existing;
    }
    const controller = new AbortController();
    let finish!: () => void;
    const entry: Entry = {
      owners: new Set([owner]),
      state: 'pending',
      controller,
      done: new Promise<void>((resolve) => {
        finish = resolve;
      }),
    };
    const entryKey = key(candidate.handle);
    entries.set(entryKey, entry);
    const startedGeneration = generation;
    controller.signal.addEventListener(
      'abort',
      () => {
        if (entries.get(entryKey) === entry) entries.delete(entryKey);
        finish();
      },
      { once: true },
    );
    queue.push(async () => {
      if (controller.signal.aborted) return;
      try {
        const resource = options.resource(candidate.handle);
        const result =
          resource.kind === 'inline'
            ? resource.value
            : await Promise.race([
                resource.read(controller.signal),
                entry.done.then(() => undefined),
              ]);
        if (!result || controller.signal.aborted) return;
        const value =
          result.kind === 'text'
            ? JSON.parse(result.text)
            : result.kind === 'json'
              ? result.value
              : undefined;
        if (!disposed && !controller.signal.aborted && generation === startedGeneration) {
          entry.value = value;
          entry.state = 'success';
          publish();
        }
      } catch {
        entry.state = 'failure';
        if (!disposed && !controller.signal.aborted && generation === startedGeneration) publish();
      } finally {
        finish();
      }
    });
    return entry;
  };
  const remember = (message: RemoteMessageView) => {
    const id = messageKey(message.id, message.version);
    if (!messages.has(id))
      messages.set(id, { candidates: candidates(message), counted: new Set(), owners: new Set() });
    return messages.get(id)!;
  };
  return {
    revision,
    peek: (id, version) => messages.get(messageKey(id, version))?.value,
    admit(batch, owner = automaticOwner) {
      if (disposed) return;
      for (const message of batch) {
        if (message.role !== 'assistant' || message.state === 'streaming' || !hasCitation(message))
          continue;
        const record = remember(message);
        record.owners.add(owner);
        for (const candidate of record.candidates) {
          const existing = entries.get(key(candidate.handle));
          if (existing) {
            existing.owners.add(owner);
            continue;
          }
          if (!record.counted.has(candidate.handle)) {
            if (
              record.counted.size >= (options.limits?.perMessage ?? 8) ||
              admitted >= (options.limits?.perWindow ?? 64)
            )
              continue;
            record.counted.add(candidate.handle);
            admitted++;
          }
          start(candidate, owner);
        }
      }
      const startedGeneration = generation;
      queueMicrotask(() => {
        if (!disposed && generation === startedGeneration) {
          publish();
          pump();
        }
      });
    },
    release(owner) {
      for (const record of messages.values()) record.owners.delete(owner);
      for (const entry of entries.values()) {
        entry.owners.delete(owner);
        if (entry.state === 'pending' && !entry.owners.size) entry.controller.abort();
      }
    },
    reset({ dropFailures = false }) {
      generation++;
      const retained = [...entries].filter(
        ([, entry]) => !dropFailures && entry.state === 'failure',
      );
      for (const entry of entries.values()) if (entry.state === 'pending') entry.controller.abort();
      entries.clear();
      for (const [oldKey, entry] of retained) {
        const handle = JSON.parse(oldKey)[3] as string;
        entries.set(key(handle), entry);
      }
      messages.clear();
      admitted = 0;
      queue.length = 0;
    },
    async materializeAll(batch, signal) {
      signal.throwIfAborted();
      if (disposed) return;
      const owner = {};
      const selected = batch.flatMap((message) => {
        const record = remember(message);
        record.owners.add(owner);
        return record.candidates.map((candidate) => start(candidate, owner));
      });
      let cancelled!: () => void;
      const cancellation = new Promise<void>((resolve) => {
        cancelled = resolve;
      });
      const abort = () => {
        cancelled();
        selected.forEach((entry) => {
          entry.owners.delete(owner);
          if (entry.state === 'pending' && !entry.owners.size) entry.controller.abort();
        });
      };
      signal.addEventListener('abort', abort, { once: true });
      pump();
      try {
        await Promise.race([Promise.all(selected.map((entry) => entry.done)), cancellation]);
        signal.throwIfAborted();
        if (!disposed) publish();
      } finally {
        signal.removeEventListener('abort', abort);
        abort();
        for (const record of messages.values()) record.owners.delete(owner);
      }
    },
    dispose() {
      disposed = true;
      generation++;
      entries.forEach((entry) => entry.controller.abort());
      queue.length = 0;
    },
  };
}

import { AgentIdSchema } from '@/shared/data/types/agent';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { AGENT_MEMORY_DOCUMENT_KEYS } from './memoryFiles';
import {
  AGENT_MEMORY_DOCUMENT_BYTES,
  AGENT_MEMORY_JOURNAL_BYTES,
  AgentMemoryDocumentKeySchema,
  AgentMemoryError,
  type AgentMemoryDocumentKey,
  type AgentMemoryFile,
  type AgentMemoryJournalEntry,
  type AgentMemoryKey,
  type AgentMemorySnapshot,
} from './memoryTypes';

export interface MemoryStorage {
  read(agentId: string, key: AgentMemoryKey): Promise<string | null>;
  replace(agentId: string, key: AgentMemoryKey, content: string): Promise<void>;
}

export type AgentMemory = ReturnType<typeof createAgentMemory>;
export type AgentMemoryOperations = Pick<
  AgentMemory,
  'read' | 'write' | 'snapshot' | 'append' | 'search'
>;

/** Owns per-Agent ordering, revisions and limits independently of Expo and the model loop. */
export function createAgentMemory(deps: {
  storage: MemoryStorage;
  assertAgent(agentId: string): Promise<void>;
  assertWritable(): void;
}) {
  const queues = new Map<string, Promise<unknown>>();
  let closed = false;

  function run<T>(agentId: string, signal: AbortSignal | undefined, task: () => Promise<T>) {
    AgentIdSchema.parse(agentId);
    if (closed) return Promise.reject(new AgentMemoryError('unavailable'));
    signal?.throwIfAborted();
    const pending = (queues.get(agentId) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (closed) throw new AgentMemoryError('unavailable');
        signal?.throwIfAborted();
        await deps.assertAgent(agentId);
        signal?.throwIfAborted();
        return task();
      });
    queues.set(agentId, pending);
    void pending
      .finally(() => {
        if (queues.get(agentId) === pending) queues.delete(agentId);
      })
      .catch(() => {});
    return pending;
  }

  async function readFile(agentId: string, key: AgentMemoryKey): Promise<AgentMemoryFile> {
    const content = await deps.storage.read(agentId, key);
    const text = content ?? '';
    const limit = key === 'journal' ? AGENT_MEMORY_JOURNAL_BYTES : AGENT_MEMORY_DOCUMENT_BYTES;
    if (new TextEncoder().encode(text).length > limit) throw new AgentMemoryError('too-large');
    return {
      key,
      content: text,
      version: content === null ? 'missing' : sha256HexOfText(text),
      truncated: false,
    };
  }

  return {
    read(agentId: string, key: AgentMemoryDocumentKey, signal?: AbortSignal) {
      AgentMemoryDocumentKeySchema.parse(key);
      return run(agentId, signal, () => readFile(agentId, key));
    },
    write(
      input: {
        agentId: string;
        key: AgentMemoryDocumentKey;
        content: string;
        expectedVersion: string;
      },
      signal?: AbortSignal,
    ) {
      AgentMemoryDocumentKeySchema.parse(input.key);
      deps.assertWritable();
      return run(input.agentId, signal, async () => {
        const previous = await readFile(input.agentId, input.key);
        if (previous.version !== input.expectedVersion) throw new AgentMemoryError('conflict');
        if (new TextEncoder().encode(input.content).length > AGENT_MEMORY_DOCUMENT_BYTES)
          throw new AgentMemoryError('too-large');
        await deps.assertAgent(input.agentId);
        signal?.throwIfAborted();
        deps.assertWritable();
        await deps.storage.replace(input.agentId, input.key, input.content);
        return readFile(input.agentId, input.key);
      });
    },
    snapshot(agentId: string, signal?: AbortSignal): Promise<AgentMemorySnapshot> {
      return run(agentId, signal, async () => {
        const [soul, user, fact] = await Promise.all(
          AGENT_MEMORY_DOCUMENT_KEYS.map(async (key): Promise<AgentMemoryFile> => {
            try {
              return await readFile(agentId, key);
            } catch {
              signal?.throwIfAborted();
              return { key, content: '', version: 'unavailable', truncated: false };
            }
          }),
        );
        return { soul, user, fact };
      });
    },
    append(agentId: string, text: string, tags: string[], signal?: AbortSignal) {
      deps.assertWritable();
      return run(agentId, signal, async () => {
        const previous = await readFile(agentId, 'journal');
        const entry: AgentMemoryJournalEntry = { ts: new Date().toISOString(), tags, text };
        const separator = previous.content && !previous.content.endsWith('\n') ? '\n' : '';
        const content = previous.content + separator + JSON.stringify(entry) + '\n';
        if (new TextEncoder().encode(content).length > AGENT_MEMORY_JOURNAL_BYTES)
          throw new AgentMemoryError('too-large');
        await deps.assertAgent(agentId);
        signal?.throwIfAborted();
        deps.assertWritable();
        await deps.storage.replace(agentId, 'journal', content);
        return entry;
      });
    },
    search(
      agentId: string,
      input: { query?: string; tag?: string; limit?: number },
      signal?: AbortSignal,
    ) {
      return run(agentId, signal, async () => {
        const journal = await readFile(agentId, 'journal');
        const lines = journal.content.split('\n');
        const matches: AgentMemoryJournalEntry[] = [];
        const query = (input.query ?? '').toLowerCase();
        const tag = (input.tag ?? '').toLowerCase();
        const limit = Math.min(50, Math.max(1, input.limit ?? 20));
        for (let index = lines.length - 1; index >= 0 && matches.length < limit; index--) {
          signal?.throwIfAborted();
          if (index % 100 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
          try {
            const entry: unknown = JSON.parse(lines[index]);
            if (!isJournalEntry(entry)) continue;
            if (query && !entry.text.toLowerCase().includes(query)) continue;
            if (tag && !entry.tags.some((value) => value.toLowerCase() === tag)) continue;
            matches.push(entry);
          } catch {
            // A damaged or interrupted JSONL entry must not hide valid earlier events.
          }
        }
        return matches;
      });
    },
    hasPendingStorageWork: () => queues.size > 0,
    async close() {
      closed = true;
      await Promise.allSettled(queues.values());
    },
  };
}

function isJournalEntry(value: unknown): value is AgentMemoryJournalEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ts' in value &&
    typeof value.ts === 'string' &&
    'text' in value &&
    typeof value.text === 'string' &&
    'tags' in value &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string')
  );
}

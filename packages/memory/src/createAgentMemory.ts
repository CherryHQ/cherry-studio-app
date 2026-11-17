import {
  AGENT_MEMORY_DOCUMENT_BYTES,
  AgentMemoryDocumentKeySchema,
  AgentMemoryError,
  type AgentMemoryDocumentKey,
  type AgentMemoryFile,
  type AgentMemoryKey,
  type AgentMemorySnapshot,
} from './identityTypes';

const AGENT_MEMORY_DOCUMENT_KEYS = ['soul', 'user'] as const;

export interface MemoryStorage {
  read(agentId: string, key: AgentMemoryKey): Promise<string | null>;
  replace(agentId: string, key: AgentMemoryKey, content: string): Promise<void>;
}

export type AgentMemory = ReturnType<typeof createAgentMemory>;
export type AgentMemoryOperations = Pick<
  AgentMemory,
  'read' | 'write' | 'snapshot' | 'setBootstrapCompleted' | 'withStorageWork'
>;

/** Owns per-Agent ordering, revisions and limits independently of Expo and the model loop. */
export function createAgentMemory(deps: {
  storage: MemoryStorage;
  hash(text: string): string;
  bootstrap: {
    read(agentId: string): Promise<boolean | null>;
    write(agentId: string, completed: boolean): Promise<void>;
  };
  assertAgent(agentId: string): Promise<void>;
  assertWritable(): void;
}) {
  const queues = new Map<string, Promise<unknown>>();
  const storageWork = new Set<Promise<unknown>>();
  let closed = false;

  function run<T>(agentId: string, signal: AbortSignal | undefined, task: () => Promise<T>) {
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
    const limit = AGENT_MEMORY_DOCUMENT_BYTES;
    if (new TextEncoder().encode(text).length > limit) throw new AgentMemoryError('too-large');
    return {
      key,
      content: text,
      version: content === null ? 'missing' : deps.hash(text),
      truncated: false,
    };
  }

  return {
    /** Covers metadata/file workflows before their first memory operation is queued. */
    withStorageWork<T>(operation: () => Promise<T>): Promise<T> {
      deps.assertWritable();
      if (closed) return Promise.reject(new AgentMemoryError('unavailable'));
      const pending = Promise.resolve().then(() => {
        if (closed) throw new AgentMemoryError('unavailable');
        deps.assertWritable();
        return operation();
      });
      storageWork.add(pending);
      void pending
        .finally(() => {
          storageWork.delete(pending);
        })
        .catch(() => {});
      return pending;
    },
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
        const [soul, user] = await Promise.all(
          AGENT_MEMORY_DOCUMENT_KEYS.map(async (key): Promise<AgentMemoryFile> => {
            try {
              return await readFile(agentId, key);
            } catch {
              signal?.throwIfAborted();
              return { key, content: '', version: 'unavailable', truncated: false };
            }
          }),
        );
        return { soul, user, bootstrapCompleted: await deps.bootstrap.read(agentId) };
      });
    },
    setBootstrapCompleted(agentId: string, completed: boolean, signal?: AbortSignal) {
      deps.assertWritable();
      return run(agentId, signal, async () => {
        deps.assertWritable();
        await deps.bootstrap.write(agentId, completed);
        return completed;
      });
    },
    hasPendingStorageWork: () => queues.size > 0 || storageWork.size > 0,
    async close() {
      closed = true;
      await Promise.allSettled([...queues.values(), ...storageWork]);
    },
  };
}

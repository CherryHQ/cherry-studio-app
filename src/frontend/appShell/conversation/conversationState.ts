import type { ConversationFailure, QueryScope, Readable } from './contracts';

export class ConversationReadError extends Error {
  constructor(readonly failure: ConversationFailure) {
    super(failure.code);
    this.name = 'ConversationReadError';
  }
}

export function createConversationState<T>(initial: T) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next: T) => {
      if (Object.is(current, next)) return;
      current = next;
      for (const listener of listeners) listener();
    },
  } satisfies Readable<T> & { set(next: T): void };
}

/** Non-secret refs carry their owner. No caller may reinterpret a ref from another scope. */
export function createConversationReferences(scope: QueryScope, sessionId?: string) {
  return {
    issue: <T extends string>(kind: string, id: string, version?: string): T =>
      JSON.stringify([scope, sessionId ?? null, kind, id, version ?? null]) as T,
    resolve: (ref: string, kind: string): { id: string; version?: string } => {
      let value: unknown;
      try {
        value = JSON.parse(ref);
      } catch {
        /* rejected below */
      }
      if (
        !Array.isArray(value) ||
        value.length !== 5 ||
        value[0] !== scope ||
        value[1] !== (sessionId ?? null) ||
        value[2] !== kind ||
        typeof value[3] !== 'string' ||
        (value[4] !== null && typeof value[4] !== 'string')
      ) {
        throw new ConversationReadError({ code: 'invalid-input', retry: 'none' });
      }
      return { id: value[3], ...(value[4] === null ? {} : { version: value[4] }) };
    },
  };
}

import type { AgentMessage, AgentPart, AgentSession } from '@cherrystudio/remote-protocol/agent';

import { REMOTE_READ_CACHE_POLICY } from './remoteReadCachePolicy';

type Window = {
  messages: AgentMessage[];
  version: string;
  hasOlderMessages: boolean;
  readAt: number;
};
type Value = { value: unknown; bytes: number };
export type ReadCacheEntry = {
  connectionId: string;
  binding: string;
  sessionId: string;
  grantId: string;
  generation: number;
  invalidated: boolean;
  active: number;
  touched: number;
  epoch?: string;
  historyVersion?: string;
  values: Map<string, Value>;
};
/** Retains protocol values only. Entry identity and generation fence late writes after invalidation. */
export class RemoteSessionReadCache {
  private readonly entries = new Map<string, ReadCacheEntry>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private bytes = 0;
  constructor(
    private readonly policy = REMOTE_READ_CACHE_POLICY,
    private readonly now = Date.now,
  ) {}
  private key(binding: string, sessionId: string) {
    return JSON.stringify([binding, sessionId]);
  }
  entry(connectionId: string, binding: string, grantId: string, sessionId: string) {
    this.prune();
    const key = this.key(binding, sessionId);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        connectionId,
        binding,
        grantId,
        sessionId,
        generation: 0,
        invalidated: false,
        active: 0,
        touched: this.now(),
        values: new Map(),
      };
      this.entries.set(key, entry);
    }
    entry.touched = this.now();
    return entry;
  }
  find(binding: string, sessionId: string) {
    const entry = this.entries.get(this.key(binding, sessionId));
    return entry && (entry.active || this.now() - entry.touched < this.policy.idleMs)
      ? entry
      : undefined;
  }
  beginHistory(entry: ReadCacheEntry, version: string) {
    if (entry.historyVersion && BigInt(version) < BigInt(entry.historyVersion)) return false;
    if (entry.historyVersion !== version) {
      entry.generation++;
      entry.historyVersion = version;
    }
    return true;
  }
  valid(entry: ReadCacheEntry, generation = entry.generation) {
    return (
      this.entries.get(this.key(entry.binding, entry.sessionId)) === entry &&
      entry.generation === generation
    );
  }
  get<T>(entry: ReadCacheEntry, key: string): T | undefined {
    if (!this.valid(entry)) return;
    return entry.values.get(key)?.value as T | undefined;
  }
  put(entry: ReadCacheEntry, generation: number, key: string, value: unknown) {
    if (!this.valid(entry, generation)) return;
    const bytes = value instanceof Uint8Array ? value.byteLength : JSON.stringify(value).length * 2;
    const previous = entry.values.get(key);
    if (previous) this.bytes -= previous.bytes;
    entry.values.delete(key);
    if (bytes <= this.policy.maxValueBytes) {
      entry.values.set(key, { value, bytes });
      this.bytes += bytes;
    }
    entry.touched = this.now();
    this.prune();
    this.notify(entry);
  }
  preview(entry: ReadCacheEntry) {
    const session = this.get<AgentSession>(entry, 'session');
    if (!session) return;
    const window = this.get<Window>(entry, 'window');
    const rows = window?.messages.flatMap((message) => {
      const parts = this.get<AgentPart[]>(entry, this.partsKey(message));
      return parts ? [{ message, parts }] : [];
    });
    return {
      session,
      ...(window
        ? { window: { ...window, rows: rows!, complete: rows!.length === window.messages.length } }
        : {}),
    };
  }
  partsKey(message: AgentMessage) {
    return JSON.stringify(['parts', message.messageId, message.revision]);
  }
  setEpoch(entry: ReadCacheEntry, epoch: string) {
    if (entry.epoch !== undefined && entry.epoch !== epoch) {
      entry.generation++;
      entry.historyVersion = undefined;
      for (const [key, value] of entry.values) {
        if (key === 'window' || key.startsWith('["parts"')) {
          entry.values.delete(key);
          this.bytes -= value.bytes;
        }
      }
      this.notify(entry);
    }
    entry.epoch = epoch;
  }
  retain(entry: ReadCacheEntry) {
    entry.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.active--;
      entry.touched = this.now();
      this.prune();
    };
  }
  subscribe(binding: string, sessionId: string, listener: () => void) {
    const key = this.key(binding, sessionId);
    const listeners = this.listeners.get(key) ?? new Set();
    this.listeners.set(key, listeners);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(key);
    };
  }
  private notify(entry: ReadCacheEntry) {
    for (const listener of this.listeners.get(this.key(entry.binding, entry.sessionId)) ?? [])
      listener();
  }
  remove(entry: ReadCacheEntry, invalidated = true) {
    if (!this.valid(entry)) return;
    entry.invalidated = invalidated;
    this.entries.delete(this.key(entry.binding, entry.sessionId));
    for (const value of entry.values.values()) this.bytes -= value.bytes;
    entry.values.clear();
    this.notify(entry);
  }
  invalidate(connectionId: string, grantId?: string) {
    for (const entry of this.entries.values())
      if (entry.connectionId === connectionId && (!grantId || entry.grantId === grantId))
        this.remove(entry);
  }
  clear() {
    for (const entry of this.entries.values()) this.remove(entry);
  }
  private prune() {
    const inactive = [...this.entries.values()]
      .filter((entry) => !entry.active)
      .sort((a, b) => a.touched - b.touched);
    let count = inactive.length;
    for (const entry of inactive) {
      if (
        this.now() - entry.touched >= this.policy.idleMs ||
        count > this.policy.maxInactiveSessions ||
        this.bytes > this.policy.maxBytes
      ) {
        this.remove(entry, false);
        count--;
      }
    }
    // Active views can hold values, but they cannot pin an unbounded cache.
    for (const entry of this.entries.values()) {
      for (const [key, value] of entry.values) {
        if (this.bytes <= this.policy.maxBytes) return;
        entry.values.delete(key);
        this.bytes -= value.bytes;
        this.notify(entry);
      }
    }
  }
}

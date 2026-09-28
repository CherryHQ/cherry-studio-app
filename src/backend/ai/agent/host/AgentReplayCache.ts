import { z } from 'zod';

import type { AgentMessageView } from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  MAX_RUNTIME_TURN_REPLAY_BYTES,
  parseRuntimeTurnReplay,
  type RuntimeTurnReplay,
  type SerializedRuntimeTurnReplay,
  serializeRuntimeTurnReplay,
} from '../runtime';
import type { ForkedMessageCopy } from '../sessionStore/AgentSessionStore';

const logger = loggerService.withContext('AgentReplayCache');
const INDEX_KEY = 'index.v1';
const ENTRY_PREFIX = 'replay.v1/';
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 128;
const IndexSchema = z
  .array(
    z.strictObject({
      key: z.string().startsWith(ENTRY_PREFIX),
      bytes: z.number().int().positive().max(MAX_RUNTIME_TURN_REPLAY_BYTES),
    }),
  )
  .max(MAX_CACHE_ENTRIES);

/** A dedicated store, never shared with preferences, UI cache, or the database. */
export type AgentReplayCacheStorage = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  getAllKeys(): string[];
  remove(key: string): void;
  clearAll(): void;
  trim(): void;
};

type ReplayMessageRef = Pick<AgentMessageView, 'id' | 'turnId'>;

/**
 * Disposable model history. The Host owns this cache through its dependency ports.
 * Only the small LRU index is held in memory; payloads are read on demand. All
 * operations are synchronous/best-effort, so storage failures never fail a chat.
 * Disposing the Host leaves the store intact for the next app process.
 */
export class AgentReplayCache {
  private storage?: AgentReplayCacheStorage;
  private entries?: Map<string, number>;
  private unavailable = false;

  constructor(private readonly createStorage: () => AgentReplayCacheStorage) {}

  readHistory(
    sessionId: string,
    messages: readonly AgentMessageView[],
  ): Record<string, RuntimeTurnReplay> {
    return this.attempt({}, () => {
      const result: Record<string, RuntimeTurnReplay> = {};
      for (const message of messages) {
        if (message.role !== 'assistant' || message.status !== 'success' || !message.turnId)
          continue;
        const stored = this.read(sessionId, message);
        if (stored) result[message.id] = stored.replay;
      }
      this.saveIndex();
      return result;
    });
  }

  write(sessionId: string, message: ReplayMessageRef, value: unknown): void {
    this.attempt(undefined, () => {
      if (!message.turnId) return;
      const stored = serializeRuntimeTurnReplay(value);
      if (!stored) return;
      this.writeEntry(sessionId, message, stored);
      this.saveIndex();
    });
  }

  copyFork(sourceSessionId: string, sessionId: string, copies: readonly ForkedMessageCopy[]): void {
    this.attempt(undefined, () => {
      // Newest turns have priority if copying a large fork evicts older source entries.
      for (const copy of copies.toReversed()) {
        if (!copy.source.turnId || !copy.target.turnId) continue;
        const stored = this.read(sourceSessionId, copy.source);
        if (stored) this.writeEntry(sessionId, copy.target, stored);
      }
      // Restore chronological recency after copying backwards, so the fork's
      // newest turns stay hot when subsequent writes need more space.
      const entries = this.loadIndex();
      for (const { target } of copies) {
        const key = entryKey(sessionId, target);
        const bytes = entries.get(key);
        if (bytes === undefined) continue;
        entries.delete(key);
        entries.set(key, bytes);
      }
      this.saveIndex();
    });
  }

  removeMessages(sessionId: string, messageIds: readonly string[]): void {
    this.removeMatching((key) =>
      messageIds.some((id) => key.startsWith(messagePrefix(sessionId, id))),
    );
  }

  removeSession(sessionId: string): void {
    this.removeMatching((key) => key.startsWith(sessionPrefix(sessionId)));
  }

  resetForRestore(): void {
    // Restore runs before initialization and may retry after a storage error.
    this.unavailable = false;
    this.attempt(undefined, () => {
      const storage = this.getStorage();
      storage.clearAll();
      storage.trim();
      this.entries = new Map();
    });
  }

  private read(
    sessionId: string,
    message: ReplayMessageRef,
  ): SerializedRuntimeTurnReplay | undefined {
    const key = entryKey(sessionId, message);
    const entries = this.loadIndex();
    const bytes = entries.get(key);
    if (bytes === undefined) return undefined;
    const serialized = this.getStorage().getString(key);
    const stored = serialized === undefined ? undefined : decodeStored(serialized, bytes);
    entries.delete(key);
    if (!stored) {
      this.getStorage().remove(key);
      return undefined;
    }
    entries.set(key, bytes);
    return stored;
  }

  private writeEntry(
    sessionId: string,
    message: ReplayMessageRef,
    { serialized, bytes }: SerializedRuntimeTurnReplay,
  ): void {
    const entries = this.loadIndex();
    const key = entryKey(sessionId, message);
    entries.delete(key);
    let total = [...entries.values()].reduce((sum, size) => sum + size, 0) + bytes;
    let evicted = false;
    while (total > MAX_CACHE_BYTES || entries.size >= MAX_CACHE_ENTRIES) {
      const oldest = entries.entries().next().value;
      if (!oldest) break;
      this.getStorage().remove(oldest[0]);
      entries.delete(oldest[0]);
      total -= oldest[1];
      evicted = true;
    }
    this.getStorage().set(key, serialized);
    entries.set(key, bytes);
    if (evicted) this.getStorage().trim();
  }

  private removeMatching(matches: (key: string) => boolean): void {
    this.attempt(undefined, () => {
      const entries = this.loadIndex();
      for (const key of entries.keys()) {
        if (!matches(key)) continue;
        this.getStorage().remove(key);
        entries.delete(key);
      }
      this.saveIndex();
      this.getStorage().trim();
    });
  }

  private getStorage(): AgentReplayCacheStorage {
    return (this.storage ??= this.createStorage());
  }

  private loadIndex(): Map<string, number> {
    if (this.entries) return this.entries;
    const storage = this.getStorage();
    const serialized = storage.getString(INDEX_KEY);
    let entries: Map<string, number>;
    try {
      const parsed = IndexSchema.parse(serialized ? JSON.parse(serialized) : []);
      entries = new Map(parsed.map(({ key, bytes }) => [key, bytes]));
      if ([...entries.values()].reduce((sum, bytes) => sum + bytes, 0) > MAX_CACHE_BYTES)
        throw new Error('Oversized cache index');
    } catch {
      storage.clearAll();
      storage.trim();
      entries = new Map();
    }
    const storedKeys = new Set(storage.getAllKeys());
    // Recover writes interrupted between the payload and index updates without
    // scanning or parsing every historical message at startup.
    for (const key of storedKeys) if (key !== INDEX_KEY && !entries.has(key)) storage.remove(key);
    for (const key of entries.keys()) if (!storedKeys.has(key)) entries.delete(key);
    this.entries = entries;
    return entries;
  }

  private saveIndex(): void {
    const entries = this.loadIndex();
    this.getStorage().set(
      INDEX_KEY,
      JSON.stringify([...entries].map(([key, bytes]) => ({ key, bytes }))),
    );
  }

  private attempt<T>(fallback: T, operation: () => T): T {
    if (this.unavailable) return fallback;
    try {
      return operation();
    } catch {
      this.unavailable = true;
      this.entries = undefined;
      logger.warn('Replay cache unavailable; using message history for this app session');
      return fallback;
    }
  }
}

function decodeStored(serialized: string, bytes: number): SerializedRuntimeTurnReplay | undefined {
  if (serialized.length > MAX_RUNTIME_TURN_REPLAY_BYTES) return undefined;
  try {
    const replay = parseRuntimeTurnReplay(JSON.parse(serialized));
    return replay ? { replay, serialized, bytes } : undefined;
  } catch {
    // Corrupt and obsolete entries degrade to the persisted display transcript.
    return undefined;
  }
}

function sessionPrefix(sessionId: string): string {
  return `${ENTRY_PREFIX}${encodeURIComponent(sessionId)}/`;
}

function messagePrefix(sessionId: string, messageId: string): string {
  return `${sessionPrefix(sessionId)}${encodeURIComponent(messageId)}/`;
}

function entryKey(sessionId: string, message: ReplayMessageRef): string {
  return `${messagePrefix(sessionId, message.id)}${encodeURIComponent(message.turnId ?? '')}`;
}

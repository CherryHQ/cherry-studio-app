import type { AgentMessageView } from '@/shared/contracts/agent';

import { AgentReplayCache } from '../AgentReplayCache';
import { createReplayCacheStorage } from './_replayCacheStorage';

const replay = { version: 1 as const, payload: { native: 'signed model history' } };

function message(id: string, overrides: Partial<AgentMessageView> = {}): AgentMessageView {
  return {
    id,
    sessionId: 'session',
    turnId: `turn-${id}`,
    role: 'assistant',
    status: 'success',
    parts: [],
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('reopens after restart and reads only the requested successful turn', () => {
  const { storage, getString, values } = createReplayCacheStorage();
  const cache = new AgentReplayCache(() => storage);
  const first = message('first');
  const second = message('second');
  cache.write('session', first, replay);
  cache.write('session', second, replay);
  const secondKey = [...values.keys()].find((key) => key.includes('/second/'))!;
  getString.mockClear();
  const restarted = new AgentReplayCache(() => storage);
  expect(getString).not.toHaveBeenCalled();
  expect(restarted.readHistory('session', [first])).toEqual({ first: replay });
  expect(getString).not.toHaveBeenCalledWith(secondKey);
  expect(restarted.readHistory('other-session', [first])).toEqual({});
  expect(restarted.readHistory('session', [{ ...first, turnId: 'retried-turn' }])).toEqual({});
  expect(
    restarted.readHistory('session', [
      { ...first, status: 'error' },
      { ...second, role: 'user' },
    ]),
  ).toEqual({});
});

test('forked replay follows the new identities and survives deletion of its source', () => {
  const { storage } = createReplayCacheStorage();
  const cache = new AgentReplayCache(() => storage);
  const source = message('source');
  const target = message('target', { sessionId: 'fork', turnId: 'fork-turn' });
  cache.write('session', source, replay);
  cache.copyFork('session', 'fork', [{ source, target }]);
  cache.removeMessages('session', ['source']);
  expect(cache.readHistory('session', [source])).toEqual({});
  expect(cache.readHistory('fork', [target])).toEqual({ target: replay });
  cache.removeSession('fork');
  expect(new AgentReplayCache(() => storage).readHistory('fork', [target])).toEqual({});
});

test('evicts old turns at the entry limit while keeping recently used history', () => {
  const { storage } = createReplayCacheStorage();
  const cache = new AgentReplayCache(() => storage);
  for (let i = 0; i < 128; i++) cache.write('session', message(String(i)), replay);
  cache.readHistory('session', [message('0')]);
  cache.write('session', message('128'), replay);
  const restarted = new AgentReplayCache(() => storage);
  expect(restarted.readHistory('session', [message('0'), message('1'), message('128')])).toEqual({
    '0': replay,
    '128': replay,
  });
});

test('a large fork keeps its recent turns hot through subsequent cache eviction', () => {
  const { storage } = createReplayCacheStorage();
  const cache = new AgentReplayCache(() => storage);
  const copies = Array.from({ length: 128 }, (_, i) => ({
    source: message(String(i)),
    target: message(`fork-${i}`),
  }));
  for (const { source } of copies) cache.write('session', source, replay);
  cache.copyFork('session', 'fork', copies);
  for (let i = 0; i < 64; i++) cache.write('other', message(String(i)), replay);
  expect(new AgentReplayCache(() => storage).readHistory('fork', [copies[127].target])).toEqual({
    'fork-127': replay,
  });
});

test('bounds stored UTF-8 bytes and rejects an oversized turn without truncating it', () => {
  const { storage, values } = createReplayCacheStorage();
  const cache = new AgentReplayCache(() => storage);
  const large = { version: 1, payload: '界'.repeat(1024 * 1024) };
  for (let i = 0; i < 12; i++) cache.write('session', message(String(i)), large);
  cache.write('session', message('oversized'), {
    version: 1,
    payload: '界'.repeat(2 * 1024 * 1024),
  });
  const payloads = [...values].filter(([key]) => key !== 'index.v1').map(([, value]) => value);
  expect(
    payloads.reduce((bytes, value) => bytes + new TextEncoder().encode(value).byteLength, 0),
  ).toBeLessThanOrEqual(32 * 1024 * 1024);
  expect(cache.readHistory('session', [message('0'), message('oversized')])).toEqual({});
  expect(cache.readHistory('session', [message('11')])).toEqual({ '11': large });
});

test('corrupt records and storage errors degrade to normal history', () => {
  const { storage, values } = createReplayCacheStorage();
  const cache = new AgentReplayCache(() => storage);
  cache.write('session', message('first'), replay);
  const key = [...values.keys()].find((key) => key !== 'index.v1')!;
  values.set(key, 'broken-json');
  expect(new AgentReplayCache(() => storage).readHistory('session', [message('first')])).toEqual(
    {},
  );
  const broken = new AgentReplayCache(() => {
    throw new Error('unavailable');
  });
  expect(() => broken.write('session', message('first'), replay)).not.toThrow();
  expect(broken.readHistory('session', [message('first')])).toEqual({});
});

test('restore clears disk and memory so old data cannot reappear after another restart', () => {
  const { storage, values } = createReplayCacheStorage();
  const cache = new AgentReplayCache(() => storage);
  cache.write('session', message('first'), replay);
  cache.resetForRestore();
  expect(values.size).toBe(0);
  expect(cache.readHistory('session', [message('first')])).toEqual({});
  expect(new AgentReplayCache(() => storage).readHistory('session', [message('first')])).toEqual(
    {},
  );
  cache.write('session', message('next'), replay);
  expect(cache.readHistory('session', [message('next')])).toEqual({ next: replay });
});

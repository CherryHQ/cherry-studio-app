import { REMOTE_READ_CACHE_POLICY } from '../remoteReadCachePolicy';
import { RemoteSessionReadCache } from '../RemoteSessionReadCache';

it('isolates bindings, expires idle data and fences late writes after removal', () => {
  let now = 0;
  const cache = new RemoteSessionReadCache({ ...REMOTE_READ_CACHE_POLICY, idleMs: 10 }, () => now);
  const old = cache.entry('pc', 'binding', 'grant', 's');
  cache.put(old, 0, 'payload', 'old');
  const other = cache.entry('pc', 'other-binding', 'grant2', 's');
  expect(cache.get(other, 'payload')).toBeUndefined();
  cache.invalidate('pc', 'grant');
  cache.put(old, 0, 'payload', 'late');
  expect(cache.find('binding', 's')).toBeUndefined();
  expect(cache.valid(other)).toBe(true);
  cache.put(other, 0, 'payload', 'remaining');
  now = 11;
  expect(cache.find('other-binding', 's')).toBeUndefined();
  const next = cache.entry('pc', 'other-binding', 'grant2', 's');
  expect(cache.get(next, 'payload')).toBeUndefined();
});

it('bounds inactive sessions and active retained bytes without making oversized reads invalid', () => {
  const cache = new RemoteSessionReadCache({
    ...REMOTE_READ_CACHE_POLICY,
    maxBytes: 24,
    maxValueBytes: 16,
    maxInactiveSessions: 1,
  });
  const first = cache.entry('pc', 'binding', 'grant', 'a');
  cache.put(first, 0, 'value', 'aaa');
  const second = cache.entry('pc', 'binding', 'grant', 'b');
  const release = cache.retain(second);
  cache.put(second, 0, 'first', 'aaaa');
  cache.put(second, 0, 'second', 'bbbb');
  cache.put(second, 0, 'third', 'cccc');
  expect(cache.get(first, 'value')).toBeUndefined();
  expect(first.invalidated).toBe(false);
  cache.put(second, 0, 'huge', 'x'.repeat(100));
  expect(cache.get(second, 'huge')).toBeUndefined();
  release();
  const third = cache.entry('pc', 'binding', 'grant', 'c');
  cache.put(third, 0, 'value', 'c');
  expect(cache.find('binding', 'b')).toBeUndefined();
});

it('epoch and history replacement fence old windows while retaining digest keyed bodies', () => {
  const cache = new RemoteSessionReadCache();
  const entry = cache.entry('pc', 'binding', 'grant', 's');
  cache.setEpoch(entry, 'one');
  cache.beginHistory(entry, '1');
  const generation = entry.generation;
  cache.put(entry, generation, 'content', new Uint8Array([1, 2]));
  cache.put(entry, generation, 'window', { messages: [] });
  cache.beginHistory(entry, '2');
  cache.put(entry, generation, 'window', { messages: ['late'] });
  expect(cache.get(entry, 'window')).toEqual({ messages: [] });
  expect(cache.beginHistory(entry, '1')).toBe(false);
  cache.setEpoch(entry, 'two');
  expect(cache.get(entry, 'window')).toBeUndefined();
  expect(cache.get(entry, 'content')).toEqual(new Uint8Array([1, 2]));
});

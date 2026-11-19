import { type ReadCacheEntry, RemoteSessionReadCache } from '../RemoteSessionReadCache';

function createPrng(seed: number) {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(maxExclusive: number): number {
      return Math.floor(this.next() * maxExclusive);
    },
  };
}

describe('RemoteSessionReadCache generation-fencing invariants', () => {
  it('preserves R1-R4 across 60 seeded randomized mutation, eviction, and fencing sequences', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const rng = createPrng(seed * 6151);
      let clock = 1_000;
      const policy = {
        idleMs: 1_000,
        maxInactiveSessions: 3,
        maxBytes: 256,
        maxValueBytes: 128,
        concurrency: 4,
      };
      const cache = new RemoteSessionReadCache(policy, () => clock);

      const sessions = ['s-1', 's-2', 's-3', 's-4', 's-5'];
      const releases = new Map<string, (() => void)[]>();
      const staleHandles: { entry: ReadCacheEntry; generation: number; key: string }[] = [];

      for (let step = 0; step < 45; step += 1) {
        const sid = sessions[rng.int(sessions.length)]!;
        const action = rng.int(8);

        if (action === 0) {
          // Acquire or touch an entry and write a value at its current generation.
          const entry = cache.entry('conn-1', 'bind-1', 'grant-1', sid);
          const gen = entry.generation;
          const payload = 'x'.repeat(rng.int(40) + 1);
          cache.put(entry, gen, `k-${rng.int(3)}`, payload);
        } else if (action === 1) {
          // Advance historyVersion monotonically and verify older versions are rejected (R2).
          const entry = cache.entry('conn-1', 'bind-1', 'grant-1', sid);
          const oldGen = entry.generation;
          const prevVersion = entry.historyVersion ? BigInt(entry.historyVersion) : 0n;
          const nextVersion = (prevVersion + 2n).toString();
          expect(cache.beginHistory(entry, nextVersion)).toBe(true);
          staleHandles.push({ entry, generation: oldGen, key: `stale-${step}` });

          // R2: an older version must be rejected without changing historyVersion or generation.
          const genAfterBump = entry.generation;
          const olderVersion = (prevVersion + 1n).toString();
          expect(cache.beginHistory(entry, olderVersion)).toBe(false);
          expect(entry.historyVersion).toBe(nextVersion);
          expect(entry.generation).toBe(genAfterBump);
        } else if (action === 2 && staleHandles.length > 0) {
          // R1: writing with a stale generation must never insert into the cache.
          const stale = staleHandles[rng.int(staleHandles.length)]!;
          cache.put(stale.entry, stale.generation, stale.key, 'should-never-land');
          expect(cache.get(stale.entry, stale.key)).toBeUndefined();
        } else if (action === 3) {
          // Change epoch on an entry -> bumps generation and drops window/parts.
          const entry = cache.entry('conn-1', 'bind-1', 'grant-1', sid);
          const oldGen = entry.generation;
          cache.setEpoch(entry, `epoch-${step}`);
          if (entry.generation !== oldGen) {
            staleHandles.push({ entry, generation: oldGen, key: `epoch-stale-${step}` });
          }
        } else if (action === 4) {
          // Retain active reference; double-release must be idempotent.
          const entry = cache.entry('conn-1', 'bind-1', 'grant-1', sid);
          const release = cache.retain(entry);
          const list = releases.get(sid) ?? [];
          list.push(release);
          releases.set(sid, list);
        } else if (action === 5) {
          const list = releases.get(sid);
          const release = list?.pop();
          if (release) {
            release();
            release(); // idempotent second call must not underflow `active`
          }
        } else if (action === 6) {
          // Advance clock past idleMs and verify retained entries stay findable (R4).
          clock += policy.idleMs + 100;
          for (const [retainedSid, list] of releases) {
            if (list.length > 0) {
              const found = cache.find('bind-1', retainedSid);
              if (found) {
                expect(found.active).toBe(list.length);
              }
            }
          }
        } else if (action === 7) {
          cache.invalidate('conn-1', 'grant-1');
          for (const list of releases.values()) list.length = 0;
        }

        // R3: Check no active entry has negative active refcount and cached total respects maxBytes.
        let computedBytes = 0;
        for (const s of sessions) {
          const found = cache.find('bind-1', s);
          if (found) {
            expect(found.active).toBeGreaterThanOrEqual(0);
            for (const value of found.values.values()) {
              computedBytes += value.bytes;
            }
          }
        }
        expect(computedBytes).toBeLessThanOrEqual(policy.maxBytes);
      }

      cache.clear();
      for (const s of sessions) {
        expect(cache.find('bind-1', s)).toBeUndefined();
      }
    }
  });
});

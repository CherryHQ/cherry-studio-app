import type { RemoteMessageView } from '@/shared/contracts/remoteAgent';

import type { ResourceRead } from '../../contracts';
import { createRemoteMessageCitationMaterializer } from '../remoteMessageCitations';

const payload = { sourceId: 's', url: 'https://example.com', title: 'Example' };
const source = { id: 's', url: payload.url, title: payload.title };
const message = (count = 1, id = 'm'): RemoteMessageView => ({
  id,
  version: '1',
  role: 'assistant',
  state: 'success',
  parts: [
    { id: 'text', kind: 'text', state: 'completed', complete: true, text: '[cite:s]' },
    ...Array.from({ length: count }, (_, i) => ({
      id: `${id}-${i}`,
      kind: 'data' as const,
      name: 'source-url',
      resource: `${id}-${i}`,
    })),
  ],
});
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const inline = (value: unknown): ResourceRead => ({
  kind: 'inline',
  value: { kind: 'text', text: JSON.stringify(value), complete: true },
});

it.each([payload, { type: 'source-url', ...payload }])(
  'normalizes native persisted/live payloads',
  async (value) => {
    const materializer = createRemoteMessageCitationMaterializer({ resource: () => inline(value) });
    materializer.admit([message()]);
    expect(materializer.peek('m', '1')).toBeUndefined();
    await tick();
    expect(materializer.peek('m', '1')?.sourcesByPartId.get('m-0')).toEqual([source]);
  },
);

it('ignores unrelated data, unsettled/user messages and citations inside code', async () => {
  const resource = jest.fn(() => inline(payload));
  const materializer = createRemoteMessageCitationMaterializer({ resource });
  const base = message();
  materializer.admit([
    {
      ...base,
      parts: [
        { id: 'x', kind: 'data', name: 'data-search-suggestions', resource: 'x' },
        { id: 'y', kind: 'data', name: 'source-document', resource: 'y' },
        base.parts[0],
      ],
    },
    { ...base, role: 'user' },
    { ...base, state: 'streaming' },
    {
      ...base,
      parts: [
        {
          ...base.parts[0],
          text: '`[cite:s]`\n```\n[cite:s]\n```',
        } as RemoteMessageView['parts'][number],
        base.parts[1],
      ],
    },
  ]);
  await tick();
  expect(resource).not.toHaveBeenCalled();
  expect(materializer.peek('m', '1')).toBeUndefined();
});

it.each(['RESOURCE_UNAVAILABLE', 'REVISION_EXPIRED'])(
  'does not retry %s failures',
  async (code) => {
    const read = jest.fn(async () => {
      throw new Error(code);
    });
    const materializer = createRemoteMessageCitationMaterializer({
      resource: (key) => ({ kind: 'deferred', key, read }),
    });
    materializer.admit([message()]);
    await tick();
    materializer.admit([message()]);
    await tick();
    expect(read).toHaveBeenCalledTimes(1);
    expect(materializer.peek('m', '1')).toBeUndefined();
  },
);

it('caps concurrent reads at four and drains explicit selections beyond both admission limits', async () => {
  let active = 0;
  let maximum = 0;
  const releases: (() => void)[] = [];
  const read = jest.fn(
    () =>
      new Promise<{ kind: 'text'; text: string; complete: true }>((resolve) => {
        active++;
        maximum = Math.max(maximum, active);
        releases.push(() => {
          active--;
          resolve({ kind: 'text', text: JSON.stringify(payload), complete: true });
        });
      }),
  );
  const materializer = createRemoteMessageCitationMaterializer({
    resource: (key) => ({ kind: 'deferred', key, read }),
  });
  const done = materializer.materializeAll([message(70)], new AbortController().signal);
  expect(read).toHaveBeenCalledTimes(4);
  for (let i = 0; i < 70; i++) {
    releases.shift()!();
    await tick();
  }
  await done;
  expect(read).toHaveBeenCalledTimes(70);
  expect(maximum).toBe(4);
  expect(materializer.peek('m', '1')?.sourcesByPartId.size).toBe(70);
});

it('keeps the ninth candidate outside automatic admission', async () => {
  const resource = jest.fn(() => inline(payload));
  const materializer = createRemoteMessageCitationMaterializer({ resource });
  materializer.admit([message(9)]);
  await tick();
  expect(resource).toHaveBeenCalledTimes(8);
  materializer.admit([message(9)]);
  await tick();
  expect(resource).toHaveBeenCalledTimes(8);
});

it('keeps the sixty-fifth candidate outside repeated admission', async () => {
  const resource = jest.fn(() => inline(payload));
  const materializer = createRemoteMessageCitationMaterializer({ resource });
  const batch = Array.from({ length: 9 }, (_, i) => message(8, `m${i}`));
  materializer.admit(batch);
  await tick();
  expect(resource).toHaveBeenCalledTimes(64);
  materializer.admit(batch);
  await tick();
  expect(resource).toHaveBeenCalledTimes(64);
});

it.each(['abort', 'dispose'])('blocks late commits after %s', async (mode) => {
  let finish!: (value: { kind: 'text'; text: string; complete: true }) => void;
  const onChange = jest.fn();
  const materializer = createRemoteMessageCitationMaterializer({
    onChange,
    resource: (key) => ({
      kind: 'deferred',
      key,
      read: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    }),
  });
  const controller = new AbortController();
  const done = materializer.materializeAll([message()], controller.signal);
  const caught = done.catch(() => undefined);
  if (mode === 'abort') controller.abort();
  else materializer.dispose();
  finish({ kind: 'text', text: JSON.stringify(payload), complete: true });
  await caught;
  await tick();
  expect(materializer.revision.getSnapshot()).toBe(0);
  expect(onChange).not.toHaveBeenCalled();
});

it('uses shared tool normalization and drops invalid native payloads/envelopes', async () => {
  const base = message();
  const materializer = createRemoteMessageCitationMaterializer({
    resource: (handle) =>
      inline(handle === 'tool' ? { results: [source] } : { ...payload, url: 'javascript:bad' }),
  });
  const view: RemoteMessageView = {
    ...base,
    parts: [
      ...base.parts,
      {
        id: 'tool',
        kind: 'tool',
        callId: 'call',
        name: 'web_search',
        state: 'completed',
        output: 'tool',
      },
    ],
  };
  await materializer.materializeAll([view], new AbortController().signal);
  expect(materializer.peek('m', '1')?.sourcesByPartId.get('tool')).toEqual([source]);
  expect(materializer.peek('m', '1')?.sourcesByPartId.get('m-0')).toEqual([]);
  const invalid = createRemoteMessageCitationMaterializer({
    resource: () => inline({ value: { results: [source] } }),
  });
  await invalid.materializeAll([view], new AbortController().signal);
  expect(invalid.peek('m', '1')?.sourcesByPartId.get('tool')).toEqual([]);
});

it('publishes native duplicate IDs in part order despite reversed completion', async () => {
  const finishes = new Map<
    string,
    (value: { kind: 'text'; text: string; complete: true }) => void
  >();
  const materializer = createRemoteMessageCitationMaterializer({
    resource: (key) => ({
      kind: 'deferred',
      key,
      read: () =>
        new Promise((resolve) => {
          finishes.set(key, resolve);
        }),
    }),
  });
  materializer.admit([message(2)]);
  await tick();
  finishes.get('m-1')!({ kind: 'text', text: JSON.stringify(payload), complete: true });
  await tick();
  expect(materializer.peek('m', '1')).toBeUndefined();
  finishes.get('m-0')!({ kind: 'text', text: JSON.stringify(payload), complete: true });
  await tick();
  expect([...materializer.peek('m', '1')!.sourcesByPartId.keys()]).toEqual(['m-0', 'm-1']);
});

it('keeps publish/snapshot/admit within 64 reads for 50 × 3 and exports the remaining 86 once', async () => {
  const batch = Array.from({ length: 50 }, (_, i) => message(3, `row${i}`));
  const counts = new Map<string, number>();
  let active = 0;
  let peak = 0;
  const materializer = createRemoteMessageCitationMaterializer({
    onChange: () => materializer.admit(batch),
    resource: (key) => ({
      kind: 'deferred',
      key,
      read: async () => {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        peak = Math.max(peak, ++active);
        await Promise.resolve();
        active--;
        return { kind: 'json', complete: true, value: payload };
      },
    }),
  });
  materializer.admit(batch);
  for (let i = 0; i < 100; i++) await tick();
  const automatic = [...counts.values()].reduce((a, b) => a + b, 0);
  expect(automatic).toBe(64);
  for (let i = 0; i < 5; i++) materializer.admit(batch);
  await tick();
  expect(counts.size).toBe(64);
  await materializer.materializeAll(batch, new AbortController().signal);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const duplicates = total - counts.size;
  expect({ automatic, peak, additional: total - automatic, duplicates }).toEqual({
    automatic: 64,
    peak: 4,
    additional: 86,
    duplicates: 0,
  });
});

it('allows automatic and explicit retries after cancellation and ignores the old response', async () => {
  const finishes: ((value: { kind: 'json'; complete: true; value: typeof payload }) => void)[] = [];
  const signals: AbortSignal[] = [];
  const materializer = createRemoteMessageCitationMaterializer({
    resource: (key) => ({
      kind: 'deferred',
      key,
      read: (signal) => {
        signals.push(signal);
        return new Promise((resolve) => finishes.push(resolve));
      },
    }),
  });
  const controller = new AbortController();
  const cancelled = materializer.materializeAll([message()], controller.signal);
  const caught = expect(cancelled).rejects.toThrow();
  controller.abort();
  await caught;
  expect(signals[0].aborted).toBe(true);
  materializer.admit([message()]);
  await tick();
  expect(signals).toHaveLength(2);
  const done = materializer.materializeAll([message()], new AbortController().signal);
  finishes[1]({ kind: 'json', complete: true, value: payload });
  await done;
  const revision = materializer.revision.getSnapshot();
  finishes[0]({ kind: 'json', complete: true, value: { ...payload, url: 'https://old.example' } });
  await tick();
  expect(materializer.revision.getSnapshot()).toBe(revision);
  expect(materializer.peek('m', '1')?.sourcesByPartId.get('m-0')).toEqual([source]);
});

it('cancelling consumer A leaves consumer B reading the shared resource', async () => {
  let finish!: (value: { kind: 'json'; complete: true; value: typeof payload }) => void;
  let underlying!: AbortSignal;
  const read = jest.fn((signal: AbortSignal) => {
    underlying = signal;
    return new Promise<{ kind: 'json'; complete: true; value: typeof payload }>((resolve) => {
      finish = resolve;
    });
  });
  const materializer = createRemoteMessageCitationMaterializer({
    resource: (key) => ({ kind: 'deferred', key, read }),
  });
  const a = new AbortController();
  const first = materializer.materializeAll([message()], a.signal);
  const caught = expect(first).rejects.toThrow();
  const second = materializer.materializeAll([message()], new AbortController().signal);
  a.abort();
  await caught;
  expect(underlying.aborted).toBe(false);
  finish({ kind: 'json', complete: true, value: payload });
  await second;
  expect(read).toHaveBeenCalledTimes(1);
  expect(materializer.peek('m', '1')?.sourcesByPartId.get('m-0')).toEqual([source]);
});

it('reset drops failures and pending generations; window owners release shared reads independently', async () => {
  let finish!: (value: { kind: 'json'; complete: true; value: typeof payload }) => void;
  let signal!: AbortSignal;
  let fails = true;
  const read = jest.fn((current: AbortSignal) => {
    signal = current;
    if (fails) return Promise.reject(new Error('unavailable'));
    return new Promise<{ kind: 'json'; complete: true; value: typeof payload }>((resolve) => {
      finish = resolve;
    });
  });
  const materializer = createRemoteMessageCitationMaterializer({
    resource: (key) => ({ kind: 'deferred', key, read }),
  });
  const a = {},
    b = {};
  materializer.admit([message()], a);
  await tick();
  materializer.reset({ dropFailures: true });
  fails = false;
  materializer.admit([message()], a);
  materializer.admit([message()], b);
  await tick();
  expect(read).toHaveBeenCalledTimes(2);
  materializer.release(a);
  expect(signal.aborted).toBe(false);
  materializer.release(b);
  expect(signal.aborted).toBe(true);
  const revision = materializer.revision.getSnapshot();
  finish({ kind: 'json', complete: true, value: payload });
  await tick();
  expect(materializer.revision.getSnapshot()).toBe(revision);
  materializer.admit([message()], a);
  await tick();
  const old = finish;
  materializer.reset({ dropFailures: true });
  old({ kind: 'json', complete: true, value: payload });
  await tick();
  expect(materializer.peek('m', '1')).toBeUndefined();
  materializer.admit([message()], b);
  await tick();
  finish({ kind: 'json', complete: true, value: payload });
  await tick();
  expect(materializer.peek('m', '1')?.sourcesByPartId.get('m-0')).toEqual([source]);
});

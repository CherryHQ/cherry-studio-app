import { LANES_PER_SESSION, runtimeLane, type RuntimeLane } from '../../runtime';
import { chooseLanes, type LanePlanningReaders, type LaneTail } from '../lanePlanning';

const SESSION = 'session-1';
const lane = (slot: number) => runtimeLane(SESSION, slot);

function readers(input: {
  tails?: Record<number, LaneTail>;
  hinted?: number;
  busy?: number[];
  boundary?: { slot: number; boundary: string };
}): LanePlanningReaders & { tail: jest.Mock } {
  return {
    tail: jest.fn(
      async (target: RuntimeLane) =>
        input.tails?.[target.slot] ?? { answerId: undefined, usedAt: 0 },
    ),
    hinted: (target) => target.slot === input.hinted,
    isBusy: (target) => input.busy?.includes(target.slot) ?? false,
    answerBoundary: async (lanes) => {
      const found =
        input.boundary && lanes.find((candidate) => candidate.slot === input.boundary!.slot);
      return found ? { lane: found, boundary: input.boundary!.boundary } : undefined;
    },
  };
}

describe('chooseLanes', () => {
  test('continues the copy whose newest answer is the parent and reads the hinted copy first', async () => {
    const reader = readers({
      hinted: 1,
      tails: { 0: { answerId: 'other', usedAt: 1 }, 1: { answerId: 'a1', usedAt: 2 } },
    });

    await expect(
      chooseLanes(reader, {
        sessionId: SESSION,
        parent: 'a1',
        count: 1,
        current: [lane(0), lane(1)],
      }),
    ).resolves.toEqual([{ lane: lane(1), mode: 'native' }]);
    expect(reader.tail).toHaveBeenCalledTimes(1);
  });

  test('forks further answers from the copy that executed the parent into free slots first', async () => {
    const reader = readers({
      tails: { 0: { answerId: 'a1', usedAt: 1 } },
      boundary: { slot: 0, boundary: 'b1' },
    });

    await expect(
      chooseLanes(reader, { sessionId: SESSION, parent: 'a1', count: 2, current: [lane(0)] }),
    ).resolves.toEqual([
      { lane: lane(0), mode: 'native' },
      { lane: lane(1), mode: 'fork', from: { lane: lane(0), boundary: 'b1' } },
    ]);
  });

  test('rebuilds from Cherry history when no current copy holds the parent', async () => {
    await expect(
      chooseLanes(readers({}), { sessionId: SESSION, parent: 'gone', count: 1, current: [] }),
    ).resolves.toEqual([{ lane: lane(0), mode: 'rebuild' }]);
  });

  test('replaces the least recently used idle copy and keeps the fork source', async () => {
    const current = Array.from({ length: LANES_PER_SESSION }, (_, slot) => lane(slot));
    const tails = Object.fromEntries(
      current.map((target) => [
        target.slot,
        { answerId: `x${target.slot}`, usedAt: 10 - target.slot },
      ]),
    );
    tails[0] = { answerId: 'a1', usedAt: 0 };
    const reader = readers({
      tails,
      boundary: { slot: 0, boundary: 'b1' },
      busy: [current.length - 1],
    });

    const [native, fork] = await chooseLanes(reader, {
      sessionId: SESSION,
      parent: 'a1',
      count: 2,
      current,
    });

    expect(native).toEqual({ lane: lane(0), mode: 'native' });
    // The busy copy is skipped; of the idle ones the least recently used is replaced.
    expect(fork).toEqual({
      lane: lane(current.length - 2),
      mode: 'fork',
      from: { lane: lane(0), boundary: 'b1' },
    });
  });

  test('reports a busy session when every copy is busy', async () => {
    const current = Array.from({ length: LANES_PER_SESSION }, (_, slot) => lane(slot));
    const reader = readers({ busy: current.map((target) => target.slot) });

    await expect(
      chooseLanes(reader, { sessionId: SESSION, parent: null, count: 1, current }),
    ).rejects.toMatchObject({ view: { code: 'SESSION_BUSY', retryable: true } });
  });
});

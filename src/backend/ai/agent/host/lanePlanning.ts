import { AgentProtocolError } from '@/shared/contracts/agent';

import { LANES_PER_SESSION, laneKey, runtimeLane, type RuntimeLane } from '../runtime';

/**
 * How one answer reaches a working copy: continue a lane whose newest answer is
 * the question's parent, natively fork the lane that executed that parent, or
 * rebuild a new lane from the Cherry history.
 */
export type LaneChoice =
  | { lane: RuntimeLane; mode: 'native' | 'rebuild' }
  | {
      lane: RuntimeLane;
      mode: 'fork';
      from: { lane: RuntimeLane; boundary: string };
    };
/** The newest answer submitted to a copy, and when the copy was last used. */
export type LaneTail = { answerId: string | undefined; usedAt: number };

/** What lane planning reads from the Host's live copies and the engine. */
export type LanePlanningReaders = {
  tail(lane: RuntimeLane): Promise<LaneTail>;
  /** Whether this Host last gave the parent answer to the copy, so it is checked first. */
  hinted(lane: RuntimeLane): boolean;
  isBusy(lane: RuntimeLane): boolean;
  /** The current copy that executed a settled answer, and that answer's history boundary. */
  answerBoundary(
    lanes: readonly RuntimeLane[],
    answerId: string,
  ): Promise<{ lane: RuntimeLane; boundary: string } | undefined>;
};

/**
 * Picks a working copy for each of `count` answers below `parent`. The first
 * answer continues the copy whose newest answer is `parent`; the others
 * natively fork the copy that executed `parent`, or rebuild from Cherry
 * history when no current copy holds it. New copies take a free slot, else
 * replace the least recently used idle copy: every copy is rebuildable.
 * Engine tails are read only as far as the choice needs them.
 */
export async function chooseLanes(
  readers: LanePlanningReaders,
  input: {
    sessionId: string;
    parent: string | null;
    count: number;
    current: readonly RuntimeLane[];
  },
): Promise<LaneChoice[]> {
  const { sessionId, parent, count, current } = input;
  const tails = new Map<string, LaneTail>();
  const tail = async (lane: RuntimeLane) => {
    const key = laneKey(lane);
    const known = tails.get(key);
    if (known) return known;
    const read = await readers.tail(lane);
    tails.set(key, read);
    return read;
  };
  // The copy this Host last gave `parent` is checked first; the engine's tail decides.
  const ordered = [...current].sort(
    (a, b) => Number(readers.hinted(b)) - Number(readers.hinted(a)),
  );
  let native: RuntimeLane | undefined;
  if (parent)
    for (const lane of ordered)
      if ((await tail(lane)).answerId === parent) {
        native = lane;
        break;
      }
  const choices: LaneChoice[] = native ? [{ lane: native, mode: 'native' }] : [];
  const source =
    parent && choices.length < count
      ? await readers.answerBoundary(
          native ? [native, ...ordered.filter((lane) => lane !== native)] : ordered,
          parent,
        )
      : undefined;
  // Free slots first, then idle copies from the least recently used; the copy continued or
  // forked from stays.
  const bound = new Set(current.map(laneKey));
  const free = Array.from({ length: LANES_PER_SESSION }, (_, slot) =>
    runtimeLane(sessionId, slot),
  ).filter((lane) => !bound.has(laneKey(lane)));
  const needed = count - choices.length;
  const reusable: { lane: RuntimeLane; usedAt: number }[] = [];
  if (free.length < needed)
    for (const lane of current)
      if (lane !== native && lane !== source?.lane && !readers.isBusy(lane))
        reusable.push({ lane, usedAt: (await tail(lane)).usedAt });
  reusable.sort((a, b) => a.usedAt - b.usedAt);
  for (const lane of [...free, ...reusable.map((entry) => entry.lane)].slice(0, needed))
    choices.push(source ? { lane, mode: 'fork', from: source } : { lane, mode: 'rebuild' });
  if (choices.length < count)
    throw new AgentProtocolError({
      code: 'SESSION_BUSY',
      message: 'Every working copy of this session is busy.',
      retryable: true,
    });
  return choices;
}

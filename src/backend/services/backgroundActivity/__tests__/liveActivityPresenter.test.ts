import {
  BACKGROUND_ACTIVITY_LINGER_MS,
  type BackgroundActivityBaseProps,
} from '@/shared/backgroundActivity/types';

import { createLiveActivityPresenter } from '../liveActivityPresenter';

type TestProps = BackgroundActivityBaseProps & { detail: string };

describe('createLiveActivityPresenter', () => {
  it('prunes ended handles before new activities while retaining active ones', async () => {
    const retained = new Set<{ active: boolean }>();
    const factory = {
      getInstances: () => {
        for (const activity of retained) {
          if (!activity.active) retained.delete(activity);
        }
        return [...retained];
      },
      start: () => {
        const activity = {
          active: true,
          end: async () => {
            activity.active = false;
          },
          update: async () => {},
        };
        retained.add(activity);
        return activity;
      },
    };
    const presenter = createLiveActivityPresenter<TestProps>(factory as never);
    const props = { detail: 'running', startedAtEpochMs: 100 };
    presenter.start(props);
    const active = [...retained][0];

    for (const policy of ['default', 'immediate'] as const) {
      const completed = presenter.start(props);
      expect(retained.size).toBe(2);
      await completed.end(policy, props);
    }

    presenter.start(props);
    expect(retained.size).toBe(2);
    expect(retained.has(active)).toBe(true);
    expect([...retained].every((activity) => activity.active)).toBe(true);
  });

  it('retires a settled activity within the linger window instead of the four-hour default', async () => {
    const { end, handle } = startHandle();

    await handle.end('default', {
      detail: 'done',
      finishedAtEpochMs: 12_345,
      startedAtEpochMs: 100,
    });

    expect(end).toHaveBeenCalledWith(
      { after: new Date(12_345 + BACKGROUND_ACTIVITY_LINGER_MS) },
      expect.objectContaining({ detail: 'done' }),
      new Date(12_345),
    );
  });

  it('ends a cancelled activity immediately', async () => {
    const { end, handle } = startHandle();

    await handle.end('immediate', {
      detail: 'cancelled',
      finishedAtEpochMs: 12_345,
      startedAtEpochMs: 100,
    });

    expect(end).toHaveBeenCalledWith(
      'immediate',
      expect.objectContaining({ detail: 'cancelled' }),
      new Date(12_345),
    );
  });

  it('dismisses a settled activity the user has seen without rewriting its content', async () => {
    const { end, handle } = startHandle();

    await handle.dismiss();

    expect(end).toHaveBeenCalledWith('immediate');
  });

  function startHandle() {
    const end = jest.fn(async () => undefined);
    const factory = {
      getInstances: jest.fn(() => []),
      start: jest.fn(() => ({ end, update: jest.fn(async () => undefined) })),
    };
    const presenter = createLiveActivityPresenter<TestProps>(factory as never);
    return { end, handle: presenter.start({ detail: 'running', startedAtEpochMs: 100 }) };
  }
});

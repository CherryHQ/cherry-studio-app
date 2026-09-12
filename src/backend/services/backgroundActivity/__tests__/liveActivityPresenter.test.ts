import type { BackgroundActivityBaseProps } from '@/shared/backgroundActivity/types';

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

  it('uses the terminal props timestamp as the Live Activity dismissal date', async () => {
    const end = jest.fn(async () => undefined);
    const factory = {
      getInstances: jest.fn(() => []),
      start: jest.fn(() => ({ end, update: jest.fn(async () => undefined) })),
    };
    const presenter = createLiveActivityPresenter<TestProps>(factory as never);
    const handle = presenter.start({ detail: 'running', startedAtEpochMs: 100 });

    await handle.end('default', {
      detail: 'done',
      finishedAtEpochMs: 12_345,
      startedAtEpochMs: 100,
    });

    expect(end).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ detail: 'done' }),
      new Date(12_345),
    );
  });
});

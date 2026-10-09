import {
  BACKGROUND_ACTIVITY_LINGER_MS,
  type BackgroundActivityBaseProps,
} from '@/shared/backgroundActivity/types';

import { createLiveActivityPresenter } from '../liveActivityPresenter';

type TestProps = BackgroundActivityBaseProps & { detail: string };

describe('createLiveActivityPresenter', () => {
  it('recognizes a removed activity by native identity without confusing another task', () => {
    const activity = { getId: () => 'first', end: jest.fn(), update: jest.fn() };
    const other = { getId: () => 'second' };
    const factory = {
      getInstances: jest.fn(() => [activity, other]),
      start: jest.fn(() => activity),
    };
    const presenter = createLiveActivityPresenter<TestProps>(factory as never);
    const handle = presenter.start({ detail: 'running', startedAtEpochMs: 100 });

    expect(handle.isActive?.()).toBe(true);
    factory.getInstances.mockReturnValue([other]);
    expect(handle.isActive?.()).toBe(false);
    expect(activity.end).not.toHaveBeenCalled();
  });

  it('bounds every native content delivery, including the final update', async () => {
    const activity = {
      end: jest.fn(async (_policy: unknown, _props?: TestProps) => {}),
      update: jest.fn(async (_props: TestProps) => {}),
    };
    const factory = { getInstances: () => [], start: jest.fn((_props: TestProps) => activity) };
    const presenter = createLiveActivityPresenter<TestProps>(factory as never);
    const props = { detail: '🌸"\\/'.repeat(4_000), startedAtEpochMs: 100 };
    const handle = presenter.start(props);
    await handle.update(props);
    await handle.end('default', props);

    for (const delivered of [
      factory.start.mock.calls[0]![0],
      activity.update.mock.calls[0]![0],
      activity.end.mock.calls[0]![1],
    ]) {
      expect(
        Buffer.byteLength(
          JSON.stringify({
            name: 'AssistantActivity',
            props: JSON.stringify(delivered),
          }).replaceAll('/', '\\/'),
          'utf8',
        ),
      ).toBeLessThanOrEqual(4 * 1024);
      expect(delivered).toMatchObject({ startedAtEpochMs: 100 });
    }
    expect(props.detail).toBe('🌸"\\/'.repeat(4_000));
  });

  it('still ends a card if its final fixed metadata cannot fit', async () => {
    const { end, handle } = startHandle();

    await expect(
      handle.end('default', {
        detail: 'done',
        phase: 'invalid'.repeat(1_000),
        startedAtEpochMs: 100,
      }),
    ).rejects.toThrow(RangeError);
    expect(end).toHaveBeenCalledWith('immediate');
  });

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

import type { BackgroundActivityBaseProps } from '@/shared/backgroundActivity/types';

import { createLiveActivityPresenter } from '../liveActivityPresenter';

type TestProps = BackgroundActivityBaseProps & { detail: string };

describe('createLiveActivityPresenter', () => {
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

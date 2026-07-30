import {
  ProviderModelPullTimeoutError,
  withProviderModelPullTimeout,
} from '../providerModelPullTimeout';

describe('provider model pull timeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('aborts and rejects when the pull exceeds the timeout', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    const request = jest.fn(
      (nextSignal: AbortSignal) =>
        new Promise<string>(() => {
          signal = nextSignal;
        }),
    );

    const result = withProviderModelPullTimeout(request, 10);

    jest.advanceTimersByTime(10);

    await expect(result).rejects.toBeInstanceOf(ProviderModelPullTimeoutError);
    expect(signal?.aborted).toBe(true);
  });

  test('resolves when the pull completes before the timeout', async () => {
    jest.useFakeTimers();

    const result = withProviderModelPullTimeout(async () => 'done', 10);

    await expect(result).resolves.toBe('done');
    jest.advanceTimersByTime(10);
  });
});

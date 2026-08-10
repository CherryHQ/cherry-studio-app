import { composeHooks } from '../composeHooks';

describe('composeHooks', () => {
  it('continues a void hook chain after one hook fails', async () => {
    const second = vi.fn();
    const hooks = composeHooks([
      {
        onStart: () => {
          throw new Error('observer unavailable');
        },
      },
      { onStart: second },
    ]);

    await expect(hooks.onStart?.()).resolves.toBeUndefined();
    expect(second).toHaveBeenCalledOnce();
  });

  it('lets any successful error hook request a retry', async () => {
    const hooks = composeHooks([
      {
        onError: () => {
          throw new Error('observer unavailable');
        },
      },
      { onError: () => 'retry' },
    ]);

    await expect(hooks.onError?.({ error: new Error('request failed') })).resolves.toBe('retry');
  });
});

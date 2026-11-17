import { afterEach, describe, expect, it, vi } from 'vitest';

import { createModelscopeTransport } from '../modelscope/modelscopeTransport';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('ModelScope submit', () => {
  it.each([undefined, 45_000])('deadline override=%s', async (requestTimeoutMs) => {
    vi.useFakeTimers();
    const started = Date.now();
    let abortedAt: number | undefined;
    let settled = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => {
            abortedAt = Date.now() - started;
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );
    const result = createModelscopeTransport({ apiKey: 'token' })
      .submit({
        modelId: 'Qwen/Qwen-Image',
        prompt: 'a fox',
        n: 1,
        size: undefined,
        seed: undefined,
        files: undefined,
        mask: undefined,
        providerParams: {},
        requestTimeoutMs,
      })
      .catch((error) => error)
      .then((value) => {
        settled = true;
        return value;
      });
    const deadline = requestTimeoutMs ?? 600_000;
    if (!requestTimeoutMs) {
      await vi.advanceTimersByTimeAsync(120_000);
      expect(abortedAt).toBeUndefined();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(479_999);
    } else {
      await vi.advanceTimersByTimeAsync(deadline - 1);
    }
    expect(abortedAt).toBeUndefined();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(abortedAt).toBe(deadline);
    expect(await result).toBeInstanceOf(Error);
    expect(settled).toBe(true);
  });
});

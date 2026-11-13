import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_IMAGE_REQUEST_TIMEOUT_MS } from '../../../constants';
import type { ImageGenerationSubmitInput } from '../imageGenerationModel';
import { createPpioTransport, PpioApiError, PpioTaskFailedError } from '../ppio/ppioTransport';

/**
 * Ported from the legacy `providers/ppio/__tests__/PpioService.test.ts` plus
 * coverage for the relocated transient-retry cap and param builders.
 */
describe('PpioTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stops polling immediately when the request is aborted', async () => {
    const transport = createPpioTransport({ apiKey: 'token' });
    const controller = new AbortController();
    const getTaskResultSpy = vi.spyOn(transport, 'getTaskResult').mockResolvedValue({
      task: { task_id: 'task-1', status: 'TASK_STATUS_PROCESSING', task_type: 'image' },
      images: [],
    });

    const pollingPromise = transport.pollTaskResult('task-1', { signal: controller.signal });

    await Promise.resolve();
    controller.abort();

    await expect(pollingPromise).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Task polling aborted',
    });

    await vi.advanceTimersByTimeAsync(15000);
    expect(getTaskResultSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects on TASK_STATUS_FAILED with PpioTaskFailedError (no reason → "Task failed" fallback)', async () => {
    const transport = createPpioTransport({ apiKey: 'token' });
    vi.spyOn(transport, 'getTaskResult').mockResolvedValue({
      task: { task_id: 'task-1', status: 'TASK_STATUS_FAILED', task_type: 'image' },
    });

    await expect(transport.pollTaskResult('task-1')).rejects.toBeInstanceOf(PpioTaskFailedError);
    await expect(transport.pollTaskResult('task-1')).rejects.toThrow('Task failed');
  });

  it('surfaces vendor reason verbatim instead of silently retrying it as transient', async () => {
    const transport = createPpioTransport({ apiKey: 'token' });
    const getTaskResultSpy = vi.spyOn(transport, 'getTaskResult').mockResolvedValue({
      task: {
        task_id: 'task-1',
        status: 'TASK_STATUS_FAILED',
        reason: 'Insufficient credits',
        task_type: 'image',
      },
    });

    const promise = transport.pollTaskResult('task-1').catch((e) => e);
    const error = await promise;

    expect(error).toBeInstanceOf(PpioTaskFailedError);
    expect((error as Error).message).toBe('Insufficient credits');
    // Terminal failure → exactly one call; no transient-retry storm.
    expect(getTaskResultSpy).toHaveBeenCalledTimes(1);
  });

  it('gives up after the transient-retry cap (10)', async () => {
    const transport = createPpioTransport({ apiKey: 'token' });
    const getTaskResultSpy = vi
      .spyOn(transport, 'getTaskResult')
      .mockRejectedValue(new Error('network glitch'));

    const promise = transport.pollTaskResult('task-1').catch((e) => e);
    await vi.advanceTimersByTimeAsync(60000);
    const error = await promise;

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('network glitch');
    expect(getTaskResultSpy).toHaveBeenCalledTimes(10);
  });

  it('retries a transient 5xx poll response up to the cap instead of failing fast', async () => {
    const transport = createPpioTransport({ apiKey: 'token' });
    const getTaskResultSpy = vi
      .spyOn(transport, 'getTaskResult')
      .mockRejectedValue(new PpioApiError('PPIO API error: 503', 503));

    const promise = transport.pollTaskResult('task-1').catch((e) => e);
    await vi.advanceTimersByTimeAsync(60000);
    const error = await promise;

    expect(error).toBeInstanceOf(PpioApiError);
    // 503 is transient → retried to the cap, not thrown on the first hit.
    expect(getTaskResultSpy).toHaveBeenCalledTimes(10);
  });

  it('treats a 4xx poll response as terminal (single call, no retry storm)', async () => {
    const transport = createPpioTransport({ apiKey: 'token' });
    const getTaskResultSpy = vi
      .spyOn(transport, 'getTaskResult')
      .mockRejectedValue(new PpioApiError('PPIO API error: 400', 400));

    const error = await transport.pollTaskResult('task-1').catch((e) => e);

    expect(error).toBeInstanceOf(PpioApiError);
    expect(getTaskResultSpy).toHaveBeenCalledTimes(1);
  });

  it('builds jimeng params with width/height from size and seed default', async () => {
    const transport = createPpioTransport({ apiKey: 'token' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ task_id: 't-1' }), { status: 200 }));

    await transport.submit({
      modelId: 'jimeng-txt2img-v3.1',
      prompt: 'a fox',
      n: 1,
      size: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      modelDescriptor: { id: 'jimeng-txt2img-v3.1', endpoint: '/v3/async/jimeng-txt2img-v3.1' },
      providerParams: {
        model: 'jimeng-txt2img-v3.1',
        size: '1328x1328',
        addWatermark: true,
      },
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      prompt: 'a fox',
      use_pre_llm: true,
      seed: -1,
      width: 1328,
      height: 1328,
      logo_info: { add_logo: true },
    });
  });

  it('uses the sync path (imageUrls) for isSync models', async () => {
    const transport = createPpioTransport({ apiKey: 'token' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ images: ['https://img/a.png'] }), { status: 200 }),
    );

    const result = await transport.submit({
      modelId: 'seedream-4.5-draw',
      prompt: 'a fox',
      n: 1,
      size: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      modelDescriptor: { id: 'seedream-4.5-draw', endpoint: '/v3/seedream-4.5', isSync: true },
      providerParams: {
        model: 'seedream-4.5-draw',
      },
    });

    expect(result).toEqual({ imageUrls: ['https://img/a.png'] });
  });

  it('uses the default request timeout for isSync models', async () => {
    const transport = createPpioTransport({ apiKey: 'token' });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal;
          signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );

    const promise = transport
      .submit({
        modelId: 'seedream-4.5-draw',
        prompt: 'a fox',
        n: 1,
        size: undefined,
        seed: undefined,
        files: undefined,
        mask: undefined,
        modelDescriptor: { id: 'seedream-4.5-draw', endpoint: '/v3/seedream-4.5', isSync: true },
        providerParams: {
          model: 'seedream-4.5-draw',
        },
      })
      .catch((error) => error);

    await vi.advanceTimersByTimeAsync(DEFAULT_IMAGE_REQUEST_TIMEOUT_MS);

    const error = await promise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      `PPIO API request timeout after ${DEFAULT_IMAGE_REQUEST_TIMEOUT_MS / 1000}s`,
    );
  });

  it.each([
    [false, undefined, 600_000],
    [true, undefined, 600_000],
    [false, 45_000, 45_000],
    [true, 45_000, 45_000],
    [false, 900_000, 900_000],
  ])(
    'aborts submit at its deadline (sync=%s, override=%s)',
    async (isSync, requestTimeoutMs, deadline) => {
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
      const result = createPpioTransport({ apiKey: 'token' })
        .submit({
          modelId: 'seedream-4.5-draw',
          prompt: 'a fox',
          n: 1,
          size: undefined,
          seed: undefined,
          files: undefined,
          mask: undefined,
          modelDescriptor: { id: 'seedream-4.5-draw', endpoint: '/v3/seedream-4.5', isSync },
          providerParams: {},
          requestTimeoutMs,
        })
        .catch((error) => error)
        .then((value) => {
          settled = true;
          return value;
        });
      if (deadline > 120_000) {
        await vi.advanceTimersByTimeAsync(120_000);
        expect(abortedAt).toBeUndefined();
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(Math.min(deadline - 1, 600_000) - 120_000);
        expect(abortedAt).toBeUndefined();
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(deadline - Math.min(deadline - 1, 600_000));
      } else {
        await vi.advanceTimersByTimeAsync(deadline - 1);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
      }
      expect(abortedAt).toBe(deadline);
      expect(await result).toBeInstanceOf(Error);
      expect(settled).toBe(true);
    },
  );

  it('propagates parent cancellation promptly without classifying it as timeout', async () => {
    const controller = new AbortController();
    let abortedAt: number | undefined;
    const started = Date.now();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => {
            abortedAt = Date.now() - started;
            reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
          });
        }),
    );
    const result = createPpioTransport({ apiKey: 'token' })
      .submit({
        modelId: 'seedream-4.5-draw',
        prompt: 'fox',
        n: 1,
        size: undefined,
        seed: undefined,
        files: undefined,
        mask: undefined,
        providerParams: {},
        signal: controller.signal,
        modelDescriptor: { id: 'seedream-4.5-draw', endpoint: '/v3/seedream-4.5', isSync: true },
      })
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    expect(abortedAt).toBe(1000);
    expect(await result).toMatchObject({ name: 'AbortError', message: 'PPIO API request aborted' });
  });

  it('cleans up the deadline and parent listener after success', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    let aborts = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      init!.signal!.addEventListener('abort', () => {
        aborts++;
      });
      return new Response(JSON.stringify({ images: ['https://img/a.png'] }));
    });
    await createPpioTransport({ apiKey: 'token' }).submit({
      modelId: 'seedream-4.5-draw',
      prompt: 'fox',
      n: 1,
      size: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerParams: {},
      signal: controller.signal,
      modelDescriptor: { id: 'seedream-4.5-draw', endpoint: '/v3/seedream-4.5', isSync: true },
      requestTimeoutMs: 45_000,
    });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(aborts).toBe(0);
  });

  it('supports official Seedream 5.0 Lite sync endpoint and object image results', async () => {
    const transport = createPpioTransport({ apiKey: 'token' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          images: [{ url: 'https://img/a.png' }, { image_url: 'https://img/b.png' }],
        }),
        {
          status: 200,
        },
      ),
    );

    const result = await transport.submit({
      modelId: 'seedream-5.0-lite',
      prompt: 'a fox',
      n: 1,
      size: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      modelDescriptor: {
        id: 'seedream-5.0-lite',
        endpoint: '/v3/seedream-5.0-lite',
        isSync: true,
        mode: 'generate',
      },
      providerParams: {
        model: 'seedream-5.0-lite',
        size: '2K',
        addWatermark: false,
      },
    });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.ppio.com/v3/seedream-5.0-lite');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      prompt: 'a fox',
      size: '2K',
      watermark: false,
      sequential_image_generation: 'disabled',
    });
    expect(result).toEqual({ imageUrls: ['https://img/a.png', 'https://img/b.png'] });
  });

  it('uses Seedream 4.0 plural images field for edit requests', async () => {
    const transport = createPpioTransport({ apiKey: 'token' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ images: ['https://img/a.png'] }), { status: 200 }),
      );

    await transport.submit({
      modelId: 'seedream-4.0',
      prompt: 'edit it',
      n: 1,
      size: undefined,
      seed: undefined,
      // Attached edit image flows through the canonical `input.files` path
      // (inputImages → options.files), not a providerOptions bag key.
      files: [{ mediaType: 'image/png', data: 'abc' }] as ImageGenerationSubmitInput['files'],
      mask: undefined,
      modelDescriptor: {
        id: 'seedream-4.0',
        endpoint: '/v3/seedream-4.0',
        isSync: true,
        mode: 'edit',
      },
      providerParams: {
        model: 'seedream-4.0',
        size: '2048x2048',
      },
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.images).toEqual(['data:image/png;base64,abc']);
    expect(body.image).toBeUndefined();
  });

  it('builds GLM Image async params with watermark_enabled', async () => {
    const transport = createPpioTransport({ apiKey: 'token' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ task_id: 't-glm' }), { status: 200 }));

    const result = await transport.submit({
      modelId: 'glm-image',
      prompt: 'a fox',
      n: 1,
      size: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      modelDescriptor: { id: 'glm-image', endpoint: '/v3/async/glm-image', mode: 'generate' },
      providerParams: {
        model: 'glm-image',
        size: '1568x1056',
        addWatermark: false,
      },
    });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.ppio.com/v3/async/glm-image');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      prompt: 'a fox',
      size: '1568x1056',
      quality: 'hd',
      watermark_enabled: false,
    });
    expect(result).toEqual({ taskId: 't-glm' });
  });
});

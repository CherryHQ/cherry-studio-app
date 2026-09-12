import { ErrorCode } from '@/shared/data/api/errors';

import { publishDataApiChanges } from '../dataApiChanges';
import { DataApiService } from '../DataApiService';

function createService(handlers: Record<string, Record<string, jest.Mock>>) {
  return new DataApiService(handlers as never);
}

describe('DataApiService', () => {
  it('cancels reads before dispatch and propagates cancellation into an active handler', async () => {
    const controller = new AbortController();
    const get = jest.fn(async ({ signal }) => {
      expect(signal).toBe(controller.signal);
      controller.abort();
      return { items: [] };
    });
    const service = createService({ '/agent-sessions': { GET: get } });
    await expect(
      service.get('/agent-sessions', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(
      service.get('/agent-sessions', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('receives published changes until its subscriber unsubscribes', () => {
    const service = createService({});
    const listener = jest.fn();
    const unsubscribe = service.subscribeChanges(listener);
    try {
      publishDataApiChanges([]);
      expect(listener).not.toHaveBeenCalled();

      publishDataApiChanges(['/ai-usage-records/stats']);
      expect(listener).toHaveBeenCalledWith(['/ai-usage-records/stats']);
      unsubscribe();
      publishDataApiChanges(['/ai-usage-records/stats']);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('prefers a static route over a path parameter', async () => {
    const ids = jest.fn(async () => ['painting-1']);
    const detail = jest.fn(async () => ({ id: 'painting-1' }));
    const service = createService({
      '/paintings/:id': { GET: detail },
      '/paintings/ids': { GET: ids },
    });

    await expect(service.get('/paintings/ids')).resolves.toEqual(['painting-1']);
    expect(ids).toHaveBeenCalledWith({ params: {}, query: undefined });
    expect(detail).not.toHaveBeenCalled();
  });

  it('decodes path parameters before dispatch', async () => {
    const get = jest.fn(async ({ params }) => ({ id: params.id }));
    const service = createService({
      '/models/:id': { GET: get },
    });

    await expect(service.get('/models/provider%3A%3Amodel')).resolves.toEqual({
      id: 'provider::model',
    });
  });

  it('captures a greedy tail parameter across slash-delimited model ids', async () => {
    const get = jest.fn(async ({ params }) => params.uniqueModelId);
    const service = createService({
      '/models/:uniqueModelId*': { GET: get },
    });

    await expect(service.get('/models/huggingface::org/model/name')).resolves.toBe(
      'huggingface::org/model/name',
    );
    expect(get).toHaveBeenCalledWith({
      params: { uniqueModelId: 'huggingface::org/model/name' },
      query: undefined,
    });
  });

  it('stops a middle greedy parameter before its static route suffix', async () => {
    const get = jest.fn(async ({ params }) => params);
    const service = createService({
      '/providers/:providerId/models/:modelId*/image-generation-support': { GET: get },
    });

    await expect(
      service.get('/providers/silicon/models/Kwai-Kolors/Kolors/image-generation-support'),
    ).resolves.toEqual({ modelId: 'Kwai-Kolors/Kolors', providerId: 'silicon' });
  });

  it('distinguishes an unsupported method from an unknown route', async () => {
    const service = createService({
      '/agents': { GET: jest.fn(async () => ({ items: [] })) },
    });

    await expect(service.delete('/agents')).rejects.toMatchObject({
      code: ErrorCode.METHOD_NOT_ALLOWED,
    });
    await expect(service.get('/unknown-route' as never)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});

import { ErrorCode } from '@/shared/data/api/types';

import { DataApiService } from '../DataApiService';

function createService(handlers: Record<string, Record<string, jest.Mock>>) {
  return new DataApiService(handlers as never);
}

describe('DataApiService', () => {
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

  it('distinguishes an unsupported method from an unknown route', async () => {
    const service = createService({
      '/topics': { GET: jest.fn(async () => ({ items: [] })) },
    });

    await expect(service.delete('/topics')).rejects.toMatchObject({
      code: ErrorCode.METHOD_NOT_ALLOWED,
    });
    await expect(service.get('/files/missing/renderable-uri')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});

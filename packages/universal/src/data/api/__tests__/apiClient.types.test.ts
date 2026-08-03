import type { Painting } from '@shared/data/types/painting';
import type { Topic } from '@shared/data/types/topic';

import type { ApiClient, CursorPaginationResponse } from '../types';

function compileTimeContract(client: ApiClient) {
  const topics: Promise<CursorPaginationResponse<Topic>> = client.get('/topics', {
    query: { limit: 20, q: 'work' },
  });
  const painting: Promise<Painting> = client.get('/paintings/painting-1');
  const removed: Promise<void> = client.delete('/models/provider::model');

  // @ts-expect-error topics only accepts its declared query fields
  void client.get('/topics', { query: { page: 1 } });
  // @ts-expect-error model creation requires an array body
  void client.post('/models', { body: { modelId: 'm', providerId: 'p' } });

  return { painting, removed, topics };
}

describe('ApiClient endpoint inference', () => {
  it('keeps the compile-time contract reachable without a runtime adapter', () => {
    expect(typeof compileTimeContract).toBe('function');
  });
});

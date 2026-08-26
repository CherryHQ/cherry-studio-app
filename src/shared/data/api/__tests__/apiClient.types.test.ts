import type { Painting } from '@/shared/data/types/painting';

import type { AgentSessionEntity } from '../schemas/agentSessions';
import type { ApiClient, CursorPaginationResponse } from '../types';

function compileTimeContract(client: ApiClient) {
  const sessions: Promise<CursorPaginationResponse<AgentSessionEntity>> = client.get(
    '/agent-sessions',
    {
      query: { agentId: 'agent-1', limit: 20 },
    },
  );
  const painting: Promise<Painting> = client.get('/paintings/painting-1');
  const removed: Promise<void> = client.delete('/models/provider::model');

  // @ts-expect-error sessions only accepts its declared query fields
  void client.get('/agent-sessions', { query: { page: 1 } });
  // @ts-expect-error model creation requires an array body
  void client.post('/models', { body: { modelId: 'm', providerId: 'p' } });

  return { painting, removed, sessions };
}

describe('ApiClient endpoint inference', () => {
  it('keeps the compile-time contract reachable without a runtime adapter', () => {
    expect(typeof compileTimeContract).toBe('function');
  });
});

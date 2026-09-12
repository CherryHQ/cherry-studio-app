import type { ImageGenerationSupport } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';

import type { AgentSessionMessagePage } from '../schemas/agentSessionMessages';
import type { AgentSessionEntity } from '../schemas/agentSessions';
import type { ApiClient, CursorPaginationResponse } from '../types';

function compileTimeContract(client: ApiClient, sessionId: string) {
  const sessions: Promise<CursorPaginationResponse<AgentSessionEntity>> = client.get(
    '/agent-sessions',
    {
      query: { agentId: 'agent-1', limit: 20 },
    },
  );
  const session: Promise<AgentSessionEntity> = client.get(`/agent-sessions/${sessionId}`);
  const messages: Promise<AgentSessionMessagePage> = client.get(
    `/agent-sessions/${sessionId}/messages`,
    { query: { aroundMessageId: 'message-1', limit: 12 } },
  );
  const painting: Promise<Painting> = client.get('/paintings/painting-1');
  const removed: Promise<void> = client.delete('/models/provider::org/model');
  const imageSupport: Promise<ImageGenerationSupport | null> = client.get(
    '/providers/provider/models/org/model/image-generation-support',
  );

  // @ts-expect-error sessions only accepts its declared query fields
  void client.get('/agent-sessions', { query: { page: 1 } });
  // @ts-expect-error message pages do not accept the session-list agent filter
  void client.get(`/agent-sessions/${sessionId}/messages`, { query: { agentId: 'agent-1' } });
  // @ts-expect-error session details do not accept pagination parameters
  void client.get(`/agent-sessions/${sessionId}`, { query: { limit: 12 } });
  // @ts-expect-error model creation requires an array body
  void client.post('/models', { body: { modelId: 'm', providerId: 'p' } });

  return { imageSupport, messages, painting, removed, session, sessions };
}

describe('ApiClient endpoint inference', () => {
  it('keeps the compile-time contract reachable without a runtime adapter', () => {
    expect(typeof compileTimeContract).toBe('function');
  });
});

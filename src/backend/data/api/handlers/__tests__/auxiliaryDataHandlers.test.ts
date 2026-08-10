import type { AgentGlobalSkillService } from '@/backend/data/services/AgentGlobalSkillService';
import type { ContentSearchService } from '@/backend/data/services/ContentSearchService';
import type { EntitySearchService } from '@/backend/data/services/EntitySearchService';
import type { TemporaryChatService } from '@/backend/data/services/TemporaryChatService';

import { createSearchHandlers } from '../search';
import { createSkillHandlers } from '../skills';
import { createTemporaryChatHandlers } from '../temporaryChats';

describe('auxiliary Data API handlers', () => {
  test('search handlers trim and validate queries before delegation', async () => {
    const contentSearch = { search: jest.fn(async () => ({ groups: [], query: 'needle' })) };
    const entitySearch = { search: jest.fn(async () => ({ groups: [], query: 'agent' })) };
    const handlers = createSearchHandlers(
      contentSearch as unknown as ContentSearchService,
      entitySearch as unknown as EntitySearchService,
    );

    await expect(handlers['/search/entities'].GET({ query: { q: '  agent  ' } })).resolves.toEqual({
      groups: [],
      query: 'agent',
    });
    expect(entitySearch.search).toHaveBeenCalledWith({ q: 'agent' });

    await expect(handlers['/search/contents'].GET({ query: { q: '   ' } })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(contentSearch.search).not.toHaveBeenCalled();
  });

  test('skills handlers preserve filtering and not-found behavior', async () => {
    const service = {
      getById: jest.fn(async () => null),
      list: jest.fn(async () => []),
    };
    const handlers = createSkillHandlers(service as unknown as AgentGlobalSkillService);

    await handlers['/skills'].GET({ query: { search: '  tools  ' } });
    expect(service.list).toHaveBeenCalledWith({ search: 'tools' });
    await expect(
      handlers['/skills/:skillId'].GET({ params: { skillId: 'missing' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('temporary chat handlers validate structured messages and forward persist', async () => {
    const service = {
      appendMessage: jest.fn(() => ({ id: 'message-1' })),
      createTopic: jest.fn(() => ({ id: 'topic-1' })),
      deleteTopic: jest.fn(),
      listMessages: jest.fn(() => []),
      persist: jest.fn(async () => ({ messageCount: 2, topicId: 'topic-1' })),
    };
    const handlers = createTemporaryChatHandlers(service as unknown as TemporaryChatService);

    await expect(
      handlers['/temporary/topics/:topicId/messages'].POST({
        body: { data: { parts: [] }, role: 'bogus' as never },
        params: { topicId: 'topic-1' },
      }),
    ).rejects.toThrow();
    expect(service.appendMessage).not.toHaveBeenCalled();

    await expect(
      handlers['/temporary/topics/:id/persist'].POST({ params: { id: 'topic-1' } }),
    ).resolves.toEqual({ messageCount: 2, topicId: 'topic-1' });
  });
});

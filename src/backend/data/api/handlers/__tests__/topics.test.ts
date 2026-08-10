import type { TopicService } from '@/backend/data/services/TopicService';

import { createTopicHandlers } from '../topics';

describe('topic handlers', () => {
  test('clears lifecycle state after every successful topic deletion path', async () => {
    const service = createService();
    const onTopicsDeleted = jest.fn();
    const handlers = createTopicHandlers(service as unknown as TopicService, onTopicsDeleted);

    await handlers['/topics'].DELETE({ query: { ids: ['topic-1', 'topic-2'] } });
    await handlers['/assistants/:assistantId/topics'].DELETE({
      params: { assistantId: 'assistant-1' },
    });
    await handlers['/topics/:id'].DELETE({ params: { id: 'topic-4' } });

    expect(service.deleteByIds).toHaveBeenCalledWith(['topic-1', 'topic-2']);
    expect(service.deleteByAssistantId).toHaveBeenCalledWith('assistant-1');
    expect(service.delete).toHaveBeenCalledWith('topic-4');
    expect(onTopicsDeleted.mock.calls).toEqual([
      [['topic-1', 'topic-2']],
      [['topic-3']],
      [['topic-4']],
    ]);
  });

  test('does not clear lifecycle state when deletion fails', async () => {
    const service = createService();
    service.deleteByIds.mockRejectedValueOnce(new Error('delete failed'));
    const onTopicsDeleted = jest.fn();
    const handlers = createTopicHandlers(service as unknown as TopicService, onTopicsDeleted);

    await expect(handlers['/topics'].DELETE({ query: { ids: ['topic-1'] } })).rejects.toThrow(
      'delete failed',
    );

    expect(onTopicsDeleted).not.toHaveBeenCalled();
  });
});

function createService() {
  return {
    delete: jest.fn(async () => undefined),
    deleteByAssistantId: jest.fn(async () => ({ deletedCount: 1, deletedIds: ['topic-3'] })),
    deleteByIds: jest.fn(async (ids: readonly string[]) => ({
      deletedCount: ids.length,
      deletedIds: [...ids],
    })),
  };
}

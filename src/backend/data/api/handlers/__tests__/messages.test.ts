import type { MessageService } from '@/backend/data/services/MessageService';

import { createMessageHandlers } from '../messages';

describe('message handlers', () => {
  test('clears lifecycle state after successful message deletion paths', async () => {
    const service = createService();
    const onTopicsDeleted = jest.fn();
    const handlers = createMessageHandlers(service as unknown as MessageService, onTopicsDeleted);

    await handlers['/messages/:id'].DELETE({ params: { id: 'message-1' } });
    await handlers['/topics/:topicId/messages'].DELETE({ params: { topicId: 'topic-2' } });

    expect(service.delete).toHaveBeenCalledWith('message-1', undefined, undefined);
    expect(service.clearTopicMessages).toHaveBeenCalledWith('topic-2');
    expect(onTopicsDeleted.mock.calls).toEqual([[['topic-1']], [['topic-2']]]);
    expect(service.delete.mock.invocationCallOrder[0]).toBeLessThan(
      onTopicsDeleted.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(service.clearTopicMessages.mock.invocationCallOrder[0]).toBeLessThan(
      onTopicsDeleted.mock.invocationCallOrder[1] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  test('does not clear lifecycle state when message deletion fails', async () => {
    const service = createService();
    service.delete.mockRejectedValueOnce(new Error('message delete failed'));
    service.clearTopicMessages.mockRejectedValueOnce(new Error('topic clear failed'));
    const onTopicsDeleted = jest.fn();
    const handlers = createMessageHandlers(service as unknown as MessageService, onTopicsDeleted);

    await expect(handlers['/messages/:id'].DELETE({ params: { id: 'message-1' } })).rejects.toThrow(
      'message delete failed',
    );
    await expect(
      handlers['/topics/:topicId/messages'].DELETE({ params: { topicId: 'topic-2' } }),
    ).rejects.toThrow('topic clear failed');

    expect(onTopicsDeleted).not.toHaveBeenCalled();
  });
});

function createService() {
  return {
    clearTopicMessages: jest.fn(async () => ({ deletedIds: ['message-2'] })),
    delete: jest.fn(async () => ({ deletedIds: ['message-1'] })),
    getById: jest.fn(async () => ({ topicId: 'topic-1' })),
  };
}

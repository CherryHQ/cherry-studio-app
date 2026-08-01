import type { DbService } from '@/backend/data/db/DbService';

import type { AiUsageRecordService } from '../AiUsageRecordService';
import { TemporaryChatService } from '../TemporaryChatService';

jest.mock('uuid', () => ({
  v4: () => '11111111-1111-4111-8111-111111111111',
  v7: () => '22222222-2222-4222-8222-222222222222',
}));
jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
  },
}));

function createService(options: { persistError?: Error } = {}) {
  const aiUsageRecord = {
    getMessageUsageProjection: jest.fn(async () => ({ requestCount: 0 })),
    refreshMessageProjection: jest.fn(async () => undefined),
  };
  const dbService = {
    withWriteTx: jest.fn(async () => {
      throw options.persistError ?? new Error('unexpected write');
    }),
  };
  return {
    aiUsageRecord,
    service: new TemporaryChatService(
      dbService as unknown as DbService,
      aiUsageRecord as unknown as AiUsageRecordService,
    ),
  };
}

describe('TemporaryChatService', () => {
  test('keeps messages isolated in memory and rejects branching fields', () => {
    const { service } = createService();
    const topic = service.createTopic({ name: 'Temporary' });
    const message = service.appendMessage(topic.id, {
      data: { parts: [{ text: 'hello', type: 'text' }] },
      role: 'user',
    });

    const first = service.listMessages(topic.id);
    first[0].data.parts = [];
    expect(service.listMessages(topic.id)[0].data.parts).toEqual([{ text: 'hello', type: 'text' }]);
    expect(message.parentId).toBeNull();
    expect(message.status).toBe('success');
    expect(() =>
      service.appendMessage(topic.id, {
        data: { parts: [] },
        parentId: 'parent',
        role: 'user',
      }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  test('restores the in-memory snapshot when persistence fails', async () => {
    const { service } = createService({ persistError: new Error('database is busy') });
    const topic = service.createTopic({ name: 'Retryable' });
    service.appendMessage(topic.id, { data: { parts: [] }, role: 'user' });

    await expect(service.persist(topic.id)).rejects.toThrow('database is busy');
    expect(service.hasTopic(topic.id)).toBe(true);
    expect(service.listMessages(topic.id)).toHaveLength(1);
  });
});

import type { DbService } from '@/backend/data/db/DbService';
import { ContentSearchService } from '../ContentSearchService';
import { EntitySearchService } from '../EntitySearchService';

jest.mock('uuid', () => ({
  v4: () => '11111111-1111-4111-8111-111111111111',
  v7: () => '22222222-2222-4222-8222-222222222222',
}));
jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
  },
}));

function queryResult(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.from = jest.fn(() => builder);
  builder.leftJoin = jest.fn(() => builder);
  builder.where = jest.fn(() => builder);
  builder.orderBy = jest.fn(() => builder);
  builder.limit = jest.fn(async () => rows);
  return builder;
}

describe('EntitySearchService', () => {
  test('aggregates the five desktop entity groups in stable order', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        queryResult([
          {
            description: 'Assistant result',
            emoji: '*',
            id: 'assistant-1',
            name: 'Needle Assistant',
            updatedAt: 100,
          },
        ]),
      )
      .mockReturnValueOnce(
        queryResult([
          {
            configuration: { avatar: '#' },
            description: 'Agent result',
            id: 'agent-1',
            name: 'Needle Agent',
            updatedAt: 200,
          },
        ]),
      )
      .mockReturnValueOnce(
        queryResult([
          {
            assistantId: 'assistant-1',
            assistantName: 'Needle Assistant',
            id: 'topic-1',
            name: 'Needle Topic',
            updatedAt: 300,
          },
        ]),
      )
      .mockReturnValueOnce(
        queryResult([
          {
            agentId: 'agent-1',
            agentName: 'Needle Agent',
            id: 'session-1',
            name: 'Needle Session',
            updatedAt: 400,
          },
        ]),
      )
      .mockReturnValueOnce(
        queryResult([{ id: 'knowledge-1', name: 'Needle Knowledge', updatedAt: 500 }]),
      );
    const service = new EntitySearchService({
      getDb: () => ({ select }),
    } as unknown as DbService);

    const result = await service.search({ q: 'Needle' });

    expect(result.groups.map((group) => group.type)).toEqual([
      'assistant',
      'agent',
      'topic',
      'session',
      'knowledge-base',
    ]);
    expect(result.groups.map((group) => group.items[0]?.id)).toEqual([
      'assistant-1',
      'agent-1',
      'topic-1',
      'session-1',
      'knowledge-1',
    ]);
  });
});

describe('ContentSearchService', () => {
  test('returns desktop topic/session groups with snippets', async () => {
    const all = jest
      .fn()
      .mockResolvedValueOnce([
        {
          createdAt: 300,
          id: 'message-1',
          role: 'assistant',
          searchableText: '**needle** topic',
          topicAssistantId: 'assistant-1',
          topicCreatedAt: 100,
          topicId: 'topic-1',
          topicName: 'Topic',
          topicUpdatedAt: 200,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          agentId: 'agent-1',
          agentName: 'Agent',
          createdAt: 400,
          role: 'user',
          rowId: 'session-message-1',
          searchableText: 'needle session',
          sessionId: 'session-1',
          sessionName: 'Session',
        },
      ])
      .mockResolvedValueOnce([]);
    const service = new ContentSearchService({
      getDb: () => ({ all }),
    } as unknown as DbService);

    const result = await service.search({ limitPerSource: 2, q: 'needle' });

    expect(result.groups.map((group) => group.sourceType)).toEqual([
      'topic-message',
      'session-message',
    ]);
    expect(result.groups[0].items[0]).toMatchObject({
      messageId: 'message-1',
      snippet: 'needle topic',
    });
    expect(result.groups[1].items[0]).toMatchObject({
      messageId: 'session-message-1',
      snippet: 'needle session',
    });
  });

  test('rewrites malformed cursor errors onto the source-specific field', async () => {
    const service = new ContentSearchService({
      getDb: () => ({ all: jest.fn() }),
    } as unknown as DbService);

    await expect(
      service.search({
        cursors: { 'topic-message': 'not-a-cursor' },
        q: 'needle',
        sources: ['topic-message'],
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        fieldErrors: {
          'cursors.topic-message': ['must be a valid search cursor'],
        },
      },
    });
  });
});

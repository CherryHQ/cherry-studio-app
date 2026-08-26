import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { DbService } from '@/backend/data/db/DbService';

import { ContentSearchService } from '../ContentSearchService';
import { EntitySearchService } from '../EntitySearchService';

jest.mock('uuid', () => ({
  v4: () => '11111111-1111-4111-8111-111111111111',
  v7: () => '22222222-2222-4222-8222-222222222222',
}));
jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
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

afterEach(uninstallTestHost);

describe('EntitySearchService', () => {
  test('aggregates the agent and session entity groups in stable order', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        queryResult([
          {
            id: 'agent-1',
            name: 'Needle Agent',
            updatedAt: 100,
          },
        ]),
      )
      .mockReturnValueOnce(
        queryResult([
          {
            agentId: 'agent-1',
            agentName: 'Needle Agent',
            id: 'session-1',
            lastActivityAt: 250,
            title: 'Needle Session',
            updatedAt: 300,
          },
        ]),
      );
    await installTestHost({
      DbService: { getDb: () => ({ select }) } as unknown as DbService,
    });
    const service = new EntitySearchService();

    const result = await service.search({ q: 'Needle' });

    expect(result.groups.map((group) => group.type)).toEqual(['agent', 'session']);
    expect(result.groups.map((group) => group.items[0]?.id)).toEqual(['agent-1', 'session-1']);
  });
});

describe('ContentSearchService', () => {
  test('returns Agent Session messages with snippets', async () => {
    const all = jest
      .fn()
      .mockResolvedValueOnce([
        {
          agentId: 'agent-1',
          agentName: 'Needle Agent',
          createdAt: 300,
          id: 'message-1',
          role: 'assistant',
          searchableText: '**needle** session',
          sessionId: 'session-1',
          sessionTitle: 'Session',
        },
      ])
      .mockResolvedValueOnce([]);
    await installTestHost({
      DbService: { getDb: () => ({ all }) } as unknown as DbService,
    });
    const service = new ContentSearchService();

    const result = await service.search({ limit: 2, q: 'needle' });

    expect(result.items[0]).toMatchObject({
      messageId: 'message-1',
      sessionId: 'session-1',
      snippet: 'needle session',
    });
  });

  test('rejects a malformed cursor as a field validation error', async () => {
    await installTestHost({
      DbService: { getDb: () => ({ all: jest.fn() }) } as unknown as DbService,
    });
    const service = new ContentSearchService();

    await expect(
      service.search({
        cursor: 'not-a-cursor',
        q: 'needle',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        fieldErrors: {
          cursor: ['must be a valid search cursor'],
        },
      },
    });
  });
});

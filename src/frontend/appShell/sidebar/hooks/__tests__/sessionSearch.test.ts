import type { ApiClient } from '@/shared/data/api/types';

import { searchSessions } from '../sessionSearch';

const labels = { sessions: 'Conversations', messages: 'Messages' };

describe('global conversation search', () => {
  test('advances only the group whose continuation was selected', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 'session-1' }], nextCursor: 'more-titles' })
      .mockResolvedValueOnce({ items: [{ messageId: 'message-1' }], nextCursor: 'more-messages' })
      .mockResolvedValueOnce({ items: [{ messageId: 'message-2' }] })
      .mockResolvedValueOnce({ items: [{ id: 'session-2' }] });
    const client = { get } as unknown as ApiClient;
    const input = { query: '计划', signal: new AbortController().signal };
    const first = await searchSessions(client, input, labels);
    expect(first.nextCursor).toBeUndefined();
    expect(first.groups.map((group) => group.nextCursor)).toEqual(['more-titles', 'more-messages']);

    const messages = await searchSessions(
      client,
      {
        ...input,
        groupKey: 'messages',
        cursor: first.groups[1].nextCursor,
      },
      labels,
    );
    expect(get).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenLastCalledWith('/search/contents', {
      query: { q: '计划', cursor: 'more-messages', limit: 50 },
      signal: input.signal,
    });
    expect(messages.groups).toEqual([
      {
        key: 'messages',
        title: 'Messages',
        items: [{ kind: 'message', item: { messageId: 'message-2' } }],
        nextCursor: undefined,
      },
    ]);

    const sessions = await searchSessions(
      client,
      {
        ...input,
        groupKey: 'sessions',
        cursor: first.groups[0].nextCursor,
      },
      labels,
    );
    expect(get).toHaveBeenCalledTimes(4);
    expect(get).toHaveBeenLastCalledWith('/agent-sessions', {
      query: { q: '计划', cursor: 'more-titles', limit: 50 },
      signal: input.signal,
    });
    expect(sessions.groups.map((group) => group.key)).toEqual(['sessions']);
  });

  test('retains an empty group that has more history to search', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [], nextCursor: 'older-history' });
    const page = await searchSessions(
      { get } as unknown as ApiClient,
      {
        query: '计划',
        signal: new AbortController().signal,
      },
      labels,
    );
    expect(page.groups[1]).toMatchObject({
      key: 'messages',
      items: [],
      nextCursor: 'older-history',
    });
  });

  test('does not dispatch a cancelled query', async () => {
    const get = jest.fn();
    const controller = new AbortController();
    controller.abort();
    await searchSessions(
      { get } as unknown as ApiClient,
      { query: 'old query', signal: controller.signal },
      labels,
    );
    expect(get).not.toHaveBeenCalled();
  });
});

import type { ApiClient } from '@/shared/data/api/types';

import { searchSessions } from '../sessionSearch';

describe('global conversation search', () => {
  test('continues each group independently until both sources are exhausted', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 'session-1' }], nextCursor: 'more-titles' })
      .mockResolvedValueOnce({ items: [{ messageId: 'message-1' }], nextCursor: 'more-messages' })
      .mockResolvedValueOnce({ items: [{ id: 'session-2' }] })
      .mockResolvedValueOnce({ items: [{ messageId: 'message-2' }], nextCursor: 'last-messages' })
      .mockResolvedValueOnce({ items: [{ messageId: 'message-3' }] });
    const client = { get } as unknown as ApiClient;
    const input = { query: '计划', signal: new AbortController().signal };
    const labels = { sessions: 'Conversations', messages: 'Messages' };
    const first = await searchSessions(client, input, labels);
    const second = await searchSessions(client, { ...input, cursor: first.nextCursor }, labels);
    const third = await searchSessions(client, { ...input, cursor: second.nextCursor }, labels);

    expect(get).toHaveBeenNthCalledWith(1, '/agent-sessions', {
      query: { q: '计划', cursor: undefined, limit: 50 },
    });
    expect(get).toHaveBeenNthCalledWith(3, '/agent-sessions', {
      query: { q: '计划', cursor: 'more-titles', limit: 50 },
    });
    expect(get).toHaveBeenNthCalledWith(5, '/search/contents', {
      query: { q: '计划', cursor: 'last-messages', limit: 50 },
    });
    expect(get).toHaveBeenCalledTimes(5);
    expect(third.groups).toEqual([
      {
        key: 'messages',
        title: 'Messages',
        items: [{ kind: 'message', item: { messageId: 'message-3' } }],
      },
    ]);
    expect(third.nextCursor).toBeUndefined();
  });

  test('does not dispatch a cancelled query', async () => {
    const get = jest.fn();
    const controller = new AbortController();
    controller.abort();
    await searchSessions(
      { get } as unknown as ApiClient,
      { query: 'old query', signal: controller.signal },
      {
        sessions: 'Conversations',
        messages: 'Messages',
      },
    );
    expect(get).not.toHaveBeenCalled();
  });
});

import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentMessageView } from '@/shared/contracts/agent';

import {
  __testing,
  type AgentMessageHistoryWindow,
  useAgentMessageHistoryWindow,
} from '../useAgentMessageHistoryWindow';

let mockOlderA = deferred<void>();
const mockLoadNextA = jest.fn(() => mockOlderA.promise);
const mockLoadNextB = jest.fn(async () => undefined);

jest.mock('@/frontend/data', () => ({
  useInfiniteQuery: (_path: string, options: { params: { sessionId: string } }) => ({
    error: undefined,
    hasNext: true,
    isLoading: false,
    isLoadingMore: false,
    loadNext: options.params.sessionId === 'session-a' ? mockLoadNextA : mockLoadNextB,
    pages: [],
    refresh: jest.fn(async () => undefined),
  }),
}));

function message(id: string): AgentMessageView {
  return {
    createdAt: '2026-08-25T00:00:00.000Z',
    id,
    parts: [],
    role: 'assistant',
    sessionId: 'session-1',
    status: 'success',
    turnId: 'turn-1',
    updatedAt: '2026-08-25T00:00:00.000Z',
    usage: null,
    modelId: null,
    inferenceSnapshot: null,
  };
}

describe('Agent Session message history', () => {
  test('reverses newest-first cursor pages into one chronological transcript', () => {
    expect(
      __testing.flattenMessagePages([
        { items: [message('4'), message('3')], nextCursor: 'older' },
        { items: [message('2'), message('1')] },
      ]),
    ).toEqual([message('1'), message('2'), message('3'), message('4')]);
  });

  test('does not carry an older-page request into another Session', async () => {
    let observed: AgentMessageHistoryWindow | undefined;
    let renderer: ReactTestRenderer | undefined;
    mockOlderA = deferred<void>();
    mockLoadNextA.mockClear();
    mockLoadNextB.mockClear();

    function Probe({ sessionId }: { sessionId: string }) {
      observed = useAgentMessageHistoryWindow(sessionId);
      return null;
    }

    await act(async () => {
      renderer = create(createElement(Probe, { sessionId: 'session-a' }));
    });

    let pendingOlderA: Promise<void> | undefined;
    await act(async () => {
      pendingOlderA = observed?.loadOlder();
      await Promise.resolve();
    });
    expect(observed?.isLoadingOlder).toBe(true);

    await act(async () => {
      renderer?.update(createElement(Probe, { sessionId: 'session-b' }));
    });
    expect(observed?.isLoadingOlder).toBe(false);

    await act(async () => observed?.loadOlder());
    expect(mockLoadNextB).toHaveBeenCalledTimes(1);

    mockOlderA.resolve();
    await act(async () => pendingOlderA);
    await act(async () => renderer?.unmount());
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

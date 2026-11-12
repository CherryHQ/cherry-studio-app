import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createConversationState } from '../../conversationState';
import type { RemoteConversationSource } from '../remoteContracts';
import { useRemoteTasks, useRemoteTaskSessions } from '../useRemoteTaskCatalog';

let mockSource: RemoteConversationSource;
jest.mock('../useRemoteConversationSource', () => ({
  useRemoteConversationSource: () => mockSource,
}));
jest.mock('../../ConversationSourceBoundary', () => ({
  useConversationSource: () => mockSource,
  useConversationSourceState: () => mockSource.state.getSnapshot(),
}));

function Tasks({ enabled }: { enabled: boolean }) {
  useRemoteTasks(enabled);
  return null;
}
function TaskSessions({ enabled }: { enabled: boolean }) {
  useRemoteTaskSessions('task', enabled);
  return null;
}

it.each([
  ['tasks', Tasks],
  ['task sessions', TaskSessions],
] as const)(
  'refreshes visible %s every 15 seconds and stops polling while hidden',
  async (_kind, Consumer) => {
    jest.useFakeTimers();
    const list = jest.fn(async () => ({ items: [] }));
    const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockSource = {
      scope: 'scope',
      ref: { kind: 'desktop', connectionId: 'pc' },
      state: createConversationState({ availability: { state: 'enabled' } }),
      catalog: { cacheScope: 'binding' },
      tasks: { list, listSessions: list },
    } as unknown as RemoteConversationSource;
    let tree: ReactTestRenderer | undefined;
    const render = (enabled = true) => (
      <QueryClientProvider client={query}>
        <Consumer enabled={enabled} />
      </QueryClientProvider>
    );
    try {
      await act(async () => {
        tree = create(render());
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(list).toHaveBeenCalledTimes(1);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(15_000);
      });
      expect(list).toHaveBeenCalledTimes(2);
      await act(async () => tree!.update(render(false)));
      const reads = list.mock.calls.length;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });
      expect(list).toHaveBeenCalledTimes(reads);
      await act(async () => tree!.update(render()));
      expect(list).toHaveBeenCalledTimes(reads + 1);
    } finally {
      await act(async () => tree?.unmount());
      query.clear();
      jest.useRealTimers();
    }
  },
);

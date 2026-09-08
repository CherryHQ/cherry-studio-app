import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import { useLatestAgentSession } from '@/frontend/hooks/agent';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';
import type { ApiClient } from '@/shared/data/api/types';

import { FirstUseGate } from '../FirstUseGate';

let mockStatus: 'unseen' | 'skipped' | 'completed' = 'unseen';

jest.mock('@/frontend/data', () => ({
  ...jest.requireActual('@/frontend/data/hooks/useDataApi'),
  usePreference: () => [mockStatus],
}));
jest.mock('@/frontend/hooks/agent', () =>
  jest.requireActual('@/frontend/hooks/agent/useAgentSessions'),
);
jest.mock('@cherrystudio/ui/components', () => ({
  ContentState: { Loading: () => null },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('expo-router', () => ({ Redirect: () => null }));

const existingSession = { id: 'session-1', title: 'Existing chat' } as AgentSessionEntity;
const dataApi = {
  delete: jest.fn(),
  get: jest.fn(),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as jest.Mocked<ApiClient>;

describe('first-use admission and chat restoration', () => {
  let queryClient: QueryClient;
  let renderer: ReactTestRenderer | undefined;
  let latest: ReturnType<typeof useLatestAgentSession> | undefined;
  let chatMountCount: number;
  let chatUnmountCount: number;

  function ChatRestoreProbe() {
    const result = useLatestAgentSession();
    useEffect(() => {
      latest = result;
    }, [result]);
    useEffect(() => {
      chatMountCount++;
      return () => {
        chatUnmountCount++;
      };
    }, []);
    return null;
  }

  async function renderGate() {
    await act(async () => {
      const tree = (
        <QueryClientProvider client={queryClient}>
          <DataApiProvider dataApi={dataApi}>
            <FirstUseGate>
              <ChatRestoreProbe />
            </FirstUseGate>
          </DataApiProvider>
        </QueryClientProvider>
      );
      if (renderer) renderer.update(tree);
      else renderer = create(tree);
    });
    await flushQueryNotifications();
  }

  beforeEach(() => {
    jest.resetAllMocks();
    mockStatus = 'unseen';
    latest = undefined;
    chatMountCount = 0;
    chatUnmountCount = 0;
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: 30_000 } },
    });
    dataApi.get.mockImplementation(
      async (path) => (path === '/agent-sessions' ? { items: [] } : []) as never,
    );
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  it('restores an existing chat from the same paginated cache populated by admission', async () => {
    dataApi.get.mockImplementation(
      async (path) => (path === '/agent-sessions' ? { items: [existingSession] } : []) as never,
    );

    await renderGate();

    expect(latest?.session).toEqual(existingSession);
    expect(renderer?.root.findAllByType(Redirect)).toHaveLength(0);
    expect(queryClient.getQueryData(['/agent-sessions', { limit: 1 }])).toEqual({
      pageParams: [undefined],
      pages: [{ items: [existingSession] }],
    });
  });

  it('keeps an empty first-use result compatible with chat after skipping setup', async () => {
    await renderGate();
    expect(renderer?.root.findByType(Redirect).props.href).toBe('/onboarding');
    expect(chatMountCount).toBe(0);

    mockStatus = 'skipped';
    await renderGate();

    expect(chatMountCount).toBe(1);
    expect(latest?.session).toBeUndefined();
    expect(latest?.error).toBeUndefined();
    expect(renderer?.root.findAllByType(Redirect)).toHaveLength(0);
    expect(queryClient.getQueryData(['/agent-sessions', { limit: 1 }])).toEqual({
      pageParams: [undefined],
      pages: [{ items: [] }],
    });
  });

  it.each(['skipped', 'completed'] as const)(
    'does not restart onboarding for a %s user with no models or sessions',
    async (status) => {
      mockStatus = status;
      await renderGate();

      expect(chatMountCount).toBe(1);
      expect(renderer?.root.findAllByType(Redirect)).toHaveLength(0);
      expect(latest?.session).toBeUndefined();
      expect(dataApi.get.mock.calls.some(([path]) => path === '/models')).toBe(false);
    },
  );

  it('keeps the admitted chat mounted while its latest session refreshes', async () => {
    dataApi.get.mockImplementation(
      async (path) => (path === '/agent-sessions' ? { items: [existingSession] } : []) as never,
    );
    await renderGate();
    expect(chatMountCount).toBe(1);

    let resolveRefresh!: (value: unknown) => void;
    dataApi.get.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }) as never,
    );
    let refresh: Promise<unknown> | undefined;
    await act(async () => {
      refresh = latest?.refetch();
    });
    await flushQueryNotifications();

    expect(latest?.isRefreshing).toBe(true);
    expect(chatMountCount).toBe(1);
    expect(chatUnmountCount).toBe(0);

    const updatedSession = { ...existingSession, title: 'Updated chat' };
    await act(async () => {
      resolveRefresh({ items: [updatedSession] });
      await refresh;
    });
    await flushQueryNotifications();
    expect(latest?.session).toEqual(updatedSession);
    expect(chatMountCount).toBe(1);
    expect(chatUnmountCount).toBe(0);
  });
});

async function flushQueryNotifications() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

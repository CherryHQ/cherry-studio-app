import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type EffectCallback, type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { AiUsageRecordTimelineResponse } from '@/shared/data/api/schemas/aiUsageRecords';
import type { ApiClient } from '@/shared/data/api/types';

import type { AiUsageWindowKey } from '../../types';
import { getAiUsageWindowRange } from '../../utils/aiUsageOverview';
import { useAiUsageOverview } from '../useAiUsageOverview';

let focusEffect: EffectCallback | undefined;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: EffectCallback) => {
    focusEffect = effect;
  },
}));

const response: AiUsageRecordTimelineResponse = {
  buckets: [
    {
      costCurrency: null,
      date: '2026-01-01',
      estimatedRequestCount: 0,
      recordCount: 5,
      requestCount: 5,
      totalCacheReadTokens: 300,
      totalCacheWriteTokens: 100,
      totalCost: 0,
      totalNoCacheTokens: 100,
      totalTokens: 500,
      unpricedRequestCount: 0,
    },
    {
      costCurrency: null,
      date: '2026-08-02',
      estimatedRequestCount: 0,
      recordCount: 2,
      requestCount: 2,
      totalCacheReadTokens: 40,
      totalCacheWriteTokens: 20,
      totalCost: 0,
      totalNoCacheTokens: 60,
      totalTokens: 120,
      unpricedRequestCount: 0,
    },
  ],
  costTotals: [],
  dailyCosts: [],
};
const dataApi = {
  delete: jest.fn(),
  get: jest.fn(async () => response),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as jest.Mocked<ApiClient>;

let latestResult: ReturnType<typeof useAiUsageOverview> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DataApiProvider dataApi={dataApi}>{children}</DataApiProvider>
    </QueryClientProvider>
  );
}

function Probe({ windowKey }: { windowKey: AiUsageWindowKey }) {
  const result = useAiUsageOverview(windowKey);

  useEffect(() => {
    latestResult = result;
  }, [result]);

  return null;
}

describe('useAiUsageOverview', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['clearTimeout', 'setTimeout'] });
    jest.setSystemTime(new Date(2026, 7, 2, 12));
    jest.clearAllMocks();
    focusEffect = undefined;
    latestResult = undefined;
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
    jest.useRealTimers();
  });

  test('queries the ungrouped token timeline and skips a duplicate first-focus fetch', async () => {
    await act(async () => {
      renderer = create(
        <Providers>
          <Probe windowKey="30d" />
        </Providers>,
      );
    });
    await flushQueryNotifications();

    const range = getAiUsageWindowRange('365d', new Date());
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/timeline', {
      query: { from: range.from, limit: 1, metric: 'tokens', to: range.to },
    });
    expect(latestResult?.overview).toMatchObject({
      cacheHitRate: 1 / 3,
      cacheObservedTokens: 120,
      totalTokens: 120,
    });
    expect(latestResult?.calendarData).toMatchObject({
      '2026-01-01': 4,
      '2026-08-02': 1,
    });

    await act(async () => focusEffect?.());
    expect(dataApi.get).toHaveBeenCalledTimes(1);

    await act(async () => focusEffect?.());
    expect(dataApi.get).toHaveBeenCalledTimes(2);
  });

  test('derives selected metrics without refetching the year timeline', async () => {
    await act(async () => {
      renderer = create(
        <Providers>
          <Probe windowKey="30d" />
        </Providers>,
      );
    });
    await flushQueryNotifications();

    await act(async () => {
      renderer?.update(
        <Providers>
          <Probe windowKey="365d" />
        </Providers>,
      );
    });
    await flushQueryNotifications();

    const range = getAiUsageWindowRange('365d', new Date());
    expect(dataApi.get).toHaveBeenCalledTimes(1);
    expect(dataApi.get).toHaveBeenLastCalledWith('/ai-usage-records/timeline', {
      query: { from: range.from, limit: 1, metric: 'tokens', to: range.to },
    });
    expect(latestResult?.overview).toMatchObject({
      cacheHitRate: 340 / 620,
      cacheObservedTokens: 620,
      totalTokens: 620,
    });
  });

  test('moves the local-date range forward when Home regains focus after midnight', async () => {
    await act(async () => {
      renderer = create(
        <Providers>
          <Probe windowKey="30d" />
        </Providers>,
      );
    });
    await flushQueryNotifications();
    await act(async () => focusEffect?.());

    jest.setSystemTime(new Date(2026, 7, 3, 8));
    await act(async () => focusEffect?.());
    await flushQueryNotifications();

    const range = getAiUsageWindowRange('365d', new Date());
    expect(dataApi.get).toHaveBeenCalledTimes(2);
    expect(dataApi.get).toHaveBeenLastCalledWith('/ai-usage-records/timeline', {
      query: { from: range.from, limit: 1, metric: 'tokens', to: range.to },
    });
  });
});

async function flushQueryNotifications() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

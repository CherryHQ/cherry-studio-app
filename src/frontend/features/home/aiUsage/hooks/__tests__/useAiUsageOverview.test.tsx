import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type EffectCallback, type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type {
  AiUsageRecordStatsMetrics,
  AiUsageRecordStatsResponse,
  AiUsageRecordTimelineResponse,
} from '@/shared/data/api/schemas/aiUsageRecords';
import type { ApiClient } from '@/shared/data/api/types';

import { getAiUsageSummaryRange } from '../../utils/aiUsageOverview';
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
const emptyMetrics: AiUsageRecordStatsMetrics = {
  costCurrency: null,
  estimatedRequestCount: 0,
  recordCount: 0,
  requestCount: 0,
  totalCacheReadTokens: 0,
  totalCacheWriteTokens: 0,
  totalCost: 0,
  totalInputTokens: 0,
  totalNoCacheTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  unpricedRequestCount: 0,
};
const statsResponse: AiUsageRecordStatsResponse = {
  buckets: [
    {
      ...emptyMetrics,
      groupBy: 'provider',
      providerId: 'anthropic',
      providerName: 'Anthropic',
      totalTokens: 500,
    },
  ],
  other: emptyMetrics,
  totals: { ...emptyMetrics, totalTokens: 500 },
};
const dataApi = {
  delete: jest.fn(),
  get: jest.fn(async (path: string) =>
    path === '/ai-usage-records/stats' ? statsResponse : response,
  ),
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

function Probe() {
  const result = useAiUsageOverview();

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
          <Probe />
        </Providers>,
      );
    });
    await flushQueryNotifications();

    const range = getAiUsageSummaryRange(new Date());
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/timeline', {
      query: { from: range.from, limit: 1, metric: 'tokens', to: range.to },
    });
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/stats', {
      query: {
        from: range.from,
        groupBy: 'provider',
        limit: 3,
        metric: 'tokens',
        to: range.to,
      },
    });
    expect(Object.keys(latestResult?.calendarData ?? {})).toHaveLength(183);
    expect(latestResult?.calendarData).not.toHaveProperty('2026-01-01');
    expect(latestResult?.calendarData).toHaveProperty('2026-08-02', 1);
    expect(latestResult?.topProviders).toEqual([
      expect.objectContaining({ providerId: 'anthropic', totalTokens: 500 }),
    ]);

    await act(async () => focusEffect?.());
    expect(dataApi.get).toHaveBeenCalledTimes(2);

    await act(async () => focusEffect?.());
    expect(dataApi.get).toHaveBeenCalledTimes(4);
  });

  test('moves the local-date range forward when Home regains focus after midnight', async () => {
    await act(async () => {
      renderer = create(
        <Providers>
          <Probe />
        </Providers>,
      );
    });
    await flushQueryNotifications();
    await act(async () => focusEffect?.());

    jest.setSystemTime(new Date(2026, 7, 3, 8));
    await act(async () => focusEffect?.());
    await flushQueryNotifications();

    const range = getAiUsageSummaryRange(new Date());
    expect(dataApi.get).toHaveBeenCalledTimes(4);
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/timeline', {
      query: { from: range.from, limit: 1, metric: 'tokens', to: range.to },
    });
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/stats', {
      query: {
        from: range.from,
        groupBy: 'provider',
        limit: 3,
        metric: 'tokens',
        to: range.to,
      },
    });
  });
});

async function flushQueryNotifications() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

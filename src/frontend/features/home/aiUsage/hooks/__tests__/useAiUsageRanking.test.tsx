import type {
  AiUsageRecordStatsMetrics,
  AiUsageRecordStatsResponse,
} from '@cherrystudio/universal/data/api/schemas/aiUsageRecords';
import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';

import type { AiUsageRankingGroup } from '../../types';
import { getAiUsageDayStatsQuery } from '../../utils/aiUsageDetail';
import { useAiUsageRanking } from '../useAiUsageRanking';

const statsResponse: AiUsageRecordStatsResponse = {
  buckets: [],
  other: emptyMetrics(),
  totals: emptyMetrics(),
};
const dataApi = {
  delete: jest.fn(),
  get: jest.fn(async () => statsResponse),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as jest.Mocked<ApiClient>;

let latestResult: ReturnType<typeof useAiUsageRanking> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DataApiProvider dataApi={dataApi}>{children}</DataApiProvider>
    </QueryClientProvider>
  );
}

function Probe({ enabled, groupBy }: { enabled: boolean; groupBy: AiUsageRankingGroup }) {
  const result = useAiUsageRanking({ enabled, groupBy, selectedDateKey: '2026-08-02' });

  useEffect(() => {
    latestResult = result;
  }, [result]);

  return null;
}

describe('useAiUsageRanking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestResult = undefined;
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  test('queries the selected day with the active ranking group', async () => {
    await renderHook(false, 'model');
    expect(dataApi.get).not.toHaveBeenCalled();

    await updateHook(true, 'model');
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/stats', {
      query: getAiUsageDayStatsQuery('2026-08-02', 'model'),
    });
    expect(latestResult?.query.hasData).toBe(true);
    expect(latestResult?.ranking).toEqual([]);

    await updateHook(true, 'provider');
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/stats', {
      query: getAiUsageDayStatsQuery('2026-08-02', 'provider'),
    });
    expect(dataApi.get).toHaveBeenCalledTimes(2);
  });
});

async function renderHook(enabled: boolean, groupBy: AiUsageRankingGroup) {
  await act(async () => {
    renderer = create(
      <Providers>
        <Probe enabled={enabled} groupBy={groupBy} />
      </Providers>,
    );
  });
  await flushQueryNotifications();
}

async function updateHook(enabled: boolean, groupBy: AiUsageRankingGroup) {
  await act(async () => {
    renderer?.update(
      <Providers>
        <Probe enabled={enabled} groupBy={groupBy} />
      </Providers>,
    );
  });
  await flushQueryNotifications();
}

async function flushQueryNotifications() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function emptyMetrics(): AiUsageRecordStatsMetrics {
  return {
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
}

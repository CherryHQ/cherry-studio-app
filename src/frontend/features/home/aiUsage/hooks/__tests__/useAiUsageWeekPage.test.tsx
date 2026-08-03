import type {
  AiUsageRecordStatsResponse,
  AiUsageRecordTimelineResponse,
} from '@cherrystudio/universal/data/api/schemas/aiUsageRecords';
import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';

import { getAiUsageDayStatsQuery, getAiUsageWeekRange } from '../../utils/aiUsageDetail';
import { useAiUsageWeekPage } from '../useAiUsageWeekPage';

const timelineResponse: AiUsageRecordTimelineResponse = {
  buckets: [],
  costTotals: [],
  dailyCosts: [],
};
const statsResponse: AiUsageRecordStatsResponse = {
  buckets: [],
  other: emptyMetrics(),
  totals: emptyMetrics(),
};
const dataApi = {
  delete: jest.fn(),
  get: jest.fn(async (path: string) =>
    path === '/ai-usage-records/timeline' ? timelineResponse : statsResponse,
  ),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as jest.Mocked<ApiClient>;

const range = getAiUsageWeekRange(new Date(2026, 7, 2, 12));
let latestResult: ReturnType<typeof useAiUsageWeekPage> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DataApiProvider dataApi={dataApi}>{children}</DataApiProvider>
    </QueryClientProvider>
  );
}

function Probe({ enabled }: { enabled: boolean }) {
  const result = useAiUsageWeekPage({
    enabled,
    range,
    selectedDateKey: '2026-08-02',
    todayDateKey: '2026-08-02',
  });

  useEffect(() => {
    latestResult = result;
  }, [result]);

  return null;
}

describe('useAiUsageWeekPage', () => {
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

  test('keeps distant pages idle until enabled, then queries timeline and selected day', async () => {
    await renderHook(false);
    expect(dataApi.get).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.update(
        <Providers>
          <Probe enabled />
        </Providers>,
      );
    });
    await flushQueryNotifications();

    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/timeline', {
      query: {
        from: range.from,
        groupBy: 'model',
        limit: 3,
        metric: 'tokens',
        to: range.to,
      },
    });
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/stats', {
      query: getAiUsageDayStatsQuery('2026-08-02'),
    });
    expect(latestResult?.timeline.hasData).toBe(true);
    expect(latestResult?.models.hasData).toBe(true);
    expect(latestResult?.weeklyData.days).toHaveLength(7);
  });
});

async function renderHook(enabled: boolean) {
  await act(async () => {
    renderer = create(
      <Providers>
        <Probe enabled={enabled} />
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

function emptyMetrics() {
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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { AiUsageRecordTimelineResponse } from '@/shared/data/api/schemas/aiUsageRecords';
import type { ApiClient } from '@/shared/data/api/types';

import { getAiUsageWeekRange, getAiUsageWeekTimelineQuery } from '../../utils/aiUsageDetail';
import { useAiUsageWeekTimeline } from '../useAiUsageWeekTimeline';

const timelineResponse: AiUsageRecordTimelineResponse = {
  buckets: [],
  costTotals: [],
  dailyCosts: [],
};
const dataApi = {
  delete: jest.fn(),
  get: jest.fn(async () => timelineResponse),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as jest.Mocked<ApiClient>;
const range = getAiUsageWeekRange(new Date(2026, 7, 2, 12));

let latestResult: ReturnType<typeof useAiUsageWeekTimeline> | undefined;
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
  const result = useAiUsageWeekTimeline({ enabled, range, todayDateKey: '2026-08-02' });

  useEffect(() => {
    latestResult = result;
  }, [result]);

  return null;
}

describe('useAiUsageWeekTimeline', () => {
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

  test('keeps distant weeks idle and only queries timeline when enabled', async () => {
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

    expect(dataApi.get).toHaveBeenCalledTimes(2);
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/timeline', {
      query: getAiUsageWeekTimelineQuery(range),
    });
    // The previous week reuses the adjacent page's range verbatim, so its cached
    // timeline is hit instead of a second round trip once that page has loaded.
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/timeline', {
      query: getAiUsageWeekTimelineQuery(getAiUsageWeekRange(new Date(2026, 6, 26, 12))),
    });
    expect(latestResult?.query.hasData).toBe(true);
    expect(latestResult?.weeklyData.days).toHaveLength(7);
    // Both weeks are empty here, so there is no ratio to express.
    expect(latestResult?.weekOverWeekChange).toBeUndefined();
  });

  test('reports the signed swing against the previous week', async () => {
    dataApi.get.mockImplementation(async (_path, options) => {
      const query = options?.query as { from: number } | undefined;
      const isPreviousWeek = query !== undefined && query.from < range.from;
      return isPreviousWeek ? timelineWith('2026-07-20', 200) : timelineWith('2026-07-27', 250);
    });

    await renderHook(true);

    expect(latestResult?.weekOverWeekChange).toBeCloseTo(0.25);
  });
});

function timelineWith(date: string, totalTokens: number): AiUsageRecordTimelineResponse {
  return {
    buckets: [
      {
        costCurrency: null,
        date,
        estimatedRequestCount: 0,
        modelId: 'model-a',
        providerId: 'provider-a',
        providerName: 'Provider A',
        recordCount: 1,
        requestCount: 1,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalCost: 0,
        totalNoCacheTokens: 0,
        totalTokens,
        unpricedRequestCount: 0,
      },
    ],
    costTotals: [],
    dailyCosts: [],
  };
}

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

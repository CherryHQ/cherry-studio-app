import type {
  AiUsageRecordStatsResponse,
  AiUsageRecordTimelineResponse,
} from '@cherrystudio/universal/data/api/schemas/aiUsageRecords';
import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type EffectCallback, type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';

import { getAiUsageDayRange, getAiUsageWeekRange } from '../../utils/aiUsageDetail';
import { useAiUsageDetail } from '../useAiUsageDetail';

let focusEffect: EffectCallback | undefined;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: EffectCallback) => {
    focusEffect = effect;
  },
}));

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

let latestResult: ReturnType<typeof useAiUsageDetail> | undefined;
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
  const result = useAiUsageDetail();

  useEffect(() => {
    latestResult = result;
  }, [result]);

  return null;
}

describe('useAiUsageDetail', () => {
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

  test('queries the current week and today with model aggregation limits', async () => {
    await renderHook();
    const weekRange = getAiUsageWeekRange(new Date());
    const dayRange = getAiUsageDayRange('2026-08-02');

    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/timeline', {
      query: {
        from: weekRange.from,
        groupBy: 'model',
        limit: 3,
        metric: 'tokens',
        to: weekRange.to,
      },
    });
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/stats', {
      query: {
        from: dayRange.from,
        groupBy: 'model',
        limit: 50,
        metric: 'tokens',
        to: dayRange.to,
      },
    });
    expect(latestResult?.selectedDateKey).toBe('2026-08-02');
  });

  test('changes the selected day and rejects future dates', async () => {
    await renderHook();

    await act(async () => latestResult?.selectDate('2026-07-29'));
    await flushQueryNotifications();
    const selectedRange = getAiUsageDayRange('2026-07-29');
    expect(dataApi.get).toHaveBeenLastCalledWith('/ai-usage-records/stats', {
      query: {
        from: selectedRange.from,
        groupBy: 'model',
        limit: 50,
        metric: 'tokens',
        to: selectedRange.to,
      },
    });

    const callCount = dataApi.get.mock.calls.length;
    await act(async () => latestResult?.selectDate('2026-08-03'));
    await flushQueryNotifications();
    expect(latestResult?.selectedDateKey).toBe('2026-07-29');
    expect(dataApi.get).toHaveBeenCalledTimes(callCount);
  });

  test('skips duplicate first focus and refreshes both queries afterwards', async () => {
    await renderHook();

    await act(async () => focusEffect?.());
    expect(dataApi.get).toHaveBeenCalledTimes(2);

    await act(async () => focusEffect?.());
    expect(dataApi.get).toHaveBeenCalledTimes(4);
  });

  test('moves into the next local week and selects the new today on focus', async () => {
    await renderHook();
    await act(async () => focusEffect?.());

    jest.setSystemTime(new Date(2026, 7, 3, 8));
    await act(async () => focusEffect?.());
    await flushQueryNotifications();

    const weekRange = getAiUsageWeekRange(new Date());
    const dayRange = getAiUsageDayRange('2026-08-03');
    expect(latestResult?.selectedDateKey).toBe('2026-08-03');
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/timeline', {
      query: expect.objectContaining({ from: weekRange.from, to: weekRange.to }),
    });
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/stats', {
      query: expect.objectContaining({ from: dayRange.from, to: dayRange.to }),
    });
  });
});

async function renderHook() {
  await act(async () => {
    renderer = create(
      <Providers>
        <Probe />
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

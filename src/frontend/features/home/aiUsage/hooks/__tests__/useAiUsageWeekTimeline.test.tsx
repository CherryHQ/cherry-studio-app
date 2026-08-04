import type { AiUsageRecordTimelineResponse } from '@cherrystudio/universal/data/api/schemas/aiUsageRecords';
import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';

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

    expect(dataApi.get).toHaveBeenCalledTimes(1);
    expect(dataApi.get).toHaveBeenCalledWith('/ai-usage-records/timeline', {
      query: getAiUsageWeekTimelineQuery(range),
    });
    expect(latestResult?.query.hasData).toBe(true);
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

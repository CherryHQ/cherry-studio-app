import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type {
  AiUsageRecordStatsMetrics,
  AiUsageRecordStatsResponse,
} from '@/shared/data/api/schemas/aiUsageRecords';
import type { ApiClient } from '@/shared/data/api/types';

import type { AiUsageRankingGroup } from '../../types';
import { useAiUsageRanking } from '../useAiUsageRanking';

const statsResponse: AiUsageRecordStatsResponse = {
  buckets: [],
  other: emptyMetrics(),
  totals: emptyMetrics(),
};
const modelStatsResponse: AiUsageRecordStatsResponse = {
  buckets: [
    {
      ...emptyMetrics(),
      groupBy: 'model',
      modelId: 'model-a',
      providerId: 'provider-a',
      providerName: 'Provider A',
      totalTokens: 100,
    },
  ],
  other: emptyMetrics(),
  totals: { ...emptyMetrics(), totalTokens: 100 },
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

function Probe({
  enabled,
  groupBy,
  selectedDateKey,
}: {
  enabled: boolean;
  groupBy: AiUsageRankingGroup;
  selectedDateKey: string;
}) {
  const result = useAiUsageRanking({ enabled, groupBy, selectedDateKey });

  useEffect(() => {
    latestResult = result;
  }, [result]);

  return null;
}

describe('useAiUsageRanking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dataApi.get.mockImplementation(async () => statsResponse);
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

  test('queries only the grouping on screen and fetches the other one on toggle', async () => {
    await renderHook(false, 'model');
    expect(dataApi.get).not.toHaveBeenCalled();

    await updateHook(true, 'model');
    expect(requestedGroupings()).toEqual(['model']);
    expect(latestResult?.query.hasData).toBe(true);
    expect(latestResult?.ranking).toEqual([]);

    // Toggling fetches the other grouping on demand.
    await updateHook(true, 'provider');
    expect(requestedGroupings()).toEqual(['model', 'provider']);
    expect(latestResult?.query.hasData).toBe(true);
  });

  test('clears the previous day while the next one loads', async () => {
    const pendingRequests: (() => void)[] = [];
    dataApi.get.mockImplementationOnce(async () => modelStatsResponse);
    await renderHook(true, 'model');
    expect(latestResult?.ranking).toEqual([
      expect.objectContaining({ groupBy: 'model', modelId: 'model-a' }),
    ]);

    dataApi.get.mockImplementation(
      async () =>
        await new Promise<AiUsageRecordStatsResponse>((resolve) => {
          pendingRequests.push(() => resolve(statsResponse));
        }),
    );
    await updateHook(true, 'model', '2026-08-03');
    expect(latestResult?.query.isLoading).toBe(true);
    expect(latestResult?.query.hasData).toBe(false);
    expect(latestResult?.ranking).toEqual([]);

    await act(async () => {
      for (const resolveRequest of pendingRequests) resolveRequest();
    });
    await flushQueryNotifications();
    expect(latestResult?.ranking).toEqual([]);
  });
});

async function renderHook(
  enabled: boolean,
  groupBy: AiUsageRankingGroup,
  selectedDateKey = '2026-08-02',
) {
  await act(async () => {
    renderer = create(
      <Providers>
        <Probe enabled={enabled} groupBy={groupBy} selectedDateKey={selectedDateKey} />
      </Providers>,
    );
  });
  await flushQueryNotifications();
}

async function updateHook(
  enabled: boolean,
  groupBy: AiUsageRankingGroup,
  selectedDateKey = '2026-08-02',
) {
  await act(async () => {
    renderer?.update(
      <Providers>
        <Probe enabled={enabled} groupBy={groupBy} selectedDateKey={selectedDateKey} />
      </Providers>,
    );
  });
  await flushQueryNotifications();
}

function requestedGroupings(): string[] {
  return dataApi.get.mock.calls.map((call) => {
    const options = call[1] as { query?: { groupBy?: string } } | undefined;
    return String(options?.query?.groupBy);
  });
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

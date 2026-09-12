import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type EffectCallback, type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { queryKeys } from '@/frontend/data';

import { getAiUsageDayStatsQuery, getAiUsageWeekTimelineQuery } from '../../utils/aiUsageDetail';
import { useAiUsageDetail } from '../useAiUsageDetail';

let focusEffect: EffectCallback | undefined;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: EffectCallback) => {
    focusEffect = effect;
  },
}));

let latestResult: ReturnType<typeof useAiUsageDetail> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
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
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 2, 12));
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
    jest.restoreAllMocks();
  });

  test('starts on the current page with eight matching-weekday selections', async () => {
    await renderHook();

    expect(latestResult?.activePageIndex).toBe(7);
    expect(latestResult?.weekDataKey).toBe('2026-07-27');
    expect(latestResult?.pages).toHaveLength(8);
    expect(latestResult?.pages.map((page) => page.key)).toEqual([
      '2026-06-08',
      '2026-06-15',
      '2026-06-22',
      '2026-06-29',
      '2026-07-06',
      '2026-07-13',
      '2026-07-20',
      '2026-07-27',
    ]);
    expect(latestResult?.pages[0]?.selectedDateKey).toBe('2026-06-14');
    expect(latestResult?.pages.at(-1)?.selectedDateKey).toBe('2026-08-02');
  });

  test('preserves each page selection and rejects dates outside its week', async () => {
    await renderHook();
    const previousPage = latestResult?.pages[6];
    expect(previousPage).toBeDefined();

    await act(async () => {
      latestResult?.selectPage(6);
      latestResult?.selectDate(previousPage!.key, '2026-07-21');
    });
    expect(latestResult?.activePageIndex).toBe(6);
    expect(latestResult?.pages[6]?.selectedDateKey).toBe('2026-07-21');

    await act(async () => latestResult?.selectDate(previousPage!.key, '2026-08-03'));
    expect(latestResult?.pages[6]?.selectedDateKey).toBe('2026-07-21');

    await act(async () => {
      latestResult?.selectPage(7);
      latestResult?.selectPage(6);
    });
    expect(latestResult?.pages[6]?.selectedDateKey).toBe('2026-07-21');
  });

  test('returns to today and refreshes the current week when focused again', async () => {
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook();
    const previousPage = latestResult!.pages[6]!;
    const currentPage = latestResult!.pages[7]!;

    await act(async () => focusEffect?.());
    expect(invalidateQueries).not.toHaveBeenCalled();

    await act(async () => {
      latestResult?.selectPage(6);
      latestResult?.selectDate(previousPage.key, '2026-07-21');
    });
    await act(async () => focusEffect?.());

    expect(latestResult?.activePageIndex).toBe(7);
    expect(latestResult?.pages[6]?.selectedDateKey).toBe('2026-07-21');
    expect(latestResult?.pages[7]?.selectedDateKey).toBe('2026-08-02');
    expect(invalidateQueries).toHaveBeenCalledTimes(3);
    expect(invalidateQueries).toHaveBeenCalledWith({
      exact: true,
      queryKey: queryKeys.aiUsageRecords.timeline(getAiUsageWeekTimelineQuery(currentPage.range)),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      exact: true,
      queryKey: queryKeys.aiUsageRecords.stats(getAiUsageDayStatsQuery('2026-08-02', 'model')),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      exact: true,
      queryKey: queryKeys.aiUsageRecords.stats(getAiUsageDayStatsQuery('2026-08-02', 'provider')),
    });
  });

  test('updates today within the same week without replacing historical selections', async () => {
    jest.setSystemTime(new Date(2026, 7, 1, 12));
    await renderHook();
    const previousPage = latestResult!.pages[6]!;

    await act(async () => {
      latestResult?.selectPage(6);
      latestResult?.selectDate(previousPage.key, '2026-07-23');
      focusEffect?.();
    });
    jest.setSystemTime(new Date(2026, 7, 2, 8));
    await act(async () => focusEffect?.());

    expect(latestResult?.activePageIndex).toBe(7);
    expect(latestResult?.weekDataKey).toBe('2026-07-27');
    expect(latestResult?.pages[6]?.selectedDateKey).toBe('2026-07-23');
    expect(latestResult?.pages[7]?.selectedDateKey).toBe('2026-08-02');
  });

  test('rebuilds the range and returns to today after crossing into a new week', async () => {
    await renderHook();
    await act(async () => {
      latestResult?.selectPage(4);
      focusEffect?.();
    });

    jest.setSystemTime(new Date(2026, 7, 3, 8));
    await act(async () => focusEffect?.());

    expect(latestResult?.activePageIndex).toBe(7);
    expect(latestResult?.weekDataKey).toBe('2026-08-03');
    expect(latestResult?.pages[0]?.key).toBe('2026-06-15');
    expect(latestResult?.pages[6]?.selectedDateKey).toBe('2026-07-27');
    expect(latestResult?.pages[7]?.selectedDateKey).toBe('2026-08-03');
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
}

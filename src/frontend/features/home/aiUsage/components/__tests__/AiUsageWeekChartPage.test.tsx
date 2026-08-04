import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AiUsageWeekTimelineResult } from '../../hooks/useAiUsageWeekTimeline';
import type { AiUsageDetailPage, AiUsageWeeklyData } from '../../types';
import { AiUsageWeekChartPage } from '../AiUsageWeekChartPage';

const mockRefetch = jest.fn();
const mockSelectDate = jest.fn();

jest.mock('lucide-uniwind/png', () => ({ RefreshCwIcon: () => null }));
jest.mock('../AiUsageWeeklyChart', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    AiUsageWeeklyChart: ({ statusAccessory, ...props }: Record<string, unknown>) => (
      <MockView {...props} testID="ai-usage-weekly-chart">
        {statusAccessory}
      </MockView>
    ),
  };
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'aiUsage.loadError': 'Usage statistics could not be loaded.',
        'aiUsage.loading': 'Loading usage statistics',
        'aiUsage.retry': 'Retry',
      })[key] ?? key,
  }),
}));

const weeklyData: AiUsageWeeklyData = {
  averageTokens: 50,
  days: [],
  series: [],
  totalTokens: 100,
};
const currentPage = pageForWeek(0, '2026-07-27', '2026-08-02');

describe('AiUsageWeekChartPage', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  test('passes page-local state to the chart without repeating the section title', async () => {
    await renderPage(currentPage);
    expect(textValues()).toEqual([]);
    const chart = renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' });
    expect(chart?.props.data).toBe(weeklyData);
    expect(chart?.props.selectedDateKey).toBe('2026-08-02');
    expect(chart?.props.onSelectDate).toBe(mockSelectDate);
  });

  test('keeps an unloaded distant week in a fixed loading state', async () => {
    await renderPage(currentPage, null);

    expect(renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' }).props.isLoading).toBe(
      true,
    );
  });

  test('shows and retries a no-cache timeline error', async () => {
    await renderPage(
      currentPage,
      queryResult({
        query: queryState({ hasData: false, isError: true, refetch: mockRefetch }),
      }),
    );

    expect(textValues()).toContain('Usage statistics could not be loaded.');
    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-weekly-chart' })).toHaveLength(0);
    const retry = renderer?.root
      .findAllByProps({ testID: 'ai-usage-week-retry-2026-07-27' })
      .find((node) => typeof node.props.onPress === 'function');
    await act(async () => retry?.props.onPress());
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  test('keeps cached chart data visible and exposes a refresh retry', async () => {
    await renderPage(
      currentPage,
      queryResult({
        query: queryState({ isError: true, refetch: mockRefetch }),
      }),
    );

    expect(renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' })).toBeDefined();
    const retry = renderer?.root
      .findAllByProps({ testID: 'ai-usage-week-refresh-retry-2026-07-27' })
      .find((node) => typeof node.props.onPress === 'function');
    await act(async () => retry?.props.onPress());
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  async function renderPage(
    page: AiUsageDetailPage,
    timeline: AiUsageWeekTimelineResult | null = queryResult(),
  ) {
    await act(async () => {
      const element = (
        <AiUsageWeekChartPage
          locale="en-US"
          page={page}
          timeline={timeline ?? undefined}
          onSelectDate={mockSelectDate}
        />
      );
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
  }

  function textValues() {
    return renderer?.root.findAllByType(Text).map((node) => node.props.children) ?? [];
  }
});

function pageForWeek(weeksAgo: number, fromKey: string, toKey: string): AiUsageDetailPage {
  const from = localDate(fromKey);
  const to = localDate(toKey);
  return {
    key: fromKey,
    range: {
      from: from.getTime(),
      to: new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime(),
    },
    selectedDateKey: toKey,
    weeksAgo,
  };
}

function localDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function queryResult(overrides: Record<string, unknown> = {}): AiUsageWeekTimelineResult {
  return {
    query: queryState({ refetch: mockRefetch }),
    weeklyData,
    ...overrides,
  } as unknown as AiUsageWeekTimelineResult;
}

function queryState(overrides: Record<string, unknown> = {}) {
  return {
    data: {},
    error: undefined,
    hasData: true,
    isError: false,
    isLoading: false,
    isRefreshing: false,
    refetch: jest.fn(),
    ...overrides,
  };
}

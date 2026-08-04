import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AiUsageDetailPage, AiUsageWeeklyData } from '../../types';
import { AiUsageWeekChartPage } from '../AiUsageWeekChartPage';

const mockRefetch = jest.fn();
const mockSelectDate = jest.fn();
const mockUseAiUsageWeekTimeline = jest.fn();

jest.mock('lucide-uniwind/png', () => ({ RefreshCwIcon: () => null }));
jest.mock('../../hooks/useAiUsageWeekTimeline', () => ({
  useAiUsageWeekTimeline: (options: Record<string, unknown>) => mockUseAiUsageWeekTimeline(options),
}));
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
    mockUseAiUsageWeekTimeline.mockReturnValue(queryResult());
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  test('passes page-local state to the chart without repeating the section title', async () => {
    await renderPage(currentPage);
    expect(textValues()).toEqual([]);
    expect(mockUseAiUsageWeekTimeline).toHaveBeenCalledWith({
      enabled: true,
      range: currentPage.range,
      todayDateKey: '2026-08-02',
    });
    const chart = renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' });
    expect(chart?.props.data).toBe(weeklyData);
    expect(chart?.props.selectedDateKey).toBe('2026-08-02');
    expect(chart?.props.onSelectDate).toBe(mockSelectDate);
  });

  test('keeps an unloaded distant week in a fixed loading state', async () => {
    mockUseAiUsageWeekTimeline.mockReturnValue(
      queryResult({ query: queryState({ hasData: false }) }),
    );
    await renderPage(currentPage, false);

    expect(renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' }).props.isLoading).toBe(
      true,
    );
  });

  test('shows and retries a no-cache timeline error', async () => {
    mockUseAiUsageWeekTimeline.mockReturnValue(
      queryResult({
        query: queryState({ hasData: false, isError: true, refetch: mockRefetch }),
      }),
    );
    await renderPage(currentPage);

    expect(textValues()).toContain('Usage statistics could not be loaded.');
    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-weekly-chart' })).toHaveLength(0);
    const retry = renderer?.root
      .findAllByProps({ testID: 'ai-usage-week-retry-2026-07-27' })
      .find((node) => typeof node.props.onPress === 'function');
    await act(async () => retry?.props.onPress());
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  test('keeps cached chart data visible and exposes a refresh retry', async () => {
    mockUseAiUsageWeekTimeline.mockReturnValue(
      queryResult({
        query: queryState({ isError: true, refetch: mockRefetch }),
      }),
    );
    await renderPage(currentPage);

    expect(renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' })).toBeDefined();
    const retry = renderer?.root
      .findAllByProps({ testID: 'ai-usage-week-refresh-retry-2026-07-27' })
      .find((node) => typeof node.props.onPress === 'function');
    await act(async () => retry?.props.onPress());
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  async function renderPage(page: AiUsageDetailPage, enabled = true) {
    await act(async () => {
      const element = (
        <AiUsageWeekChartPage
          enabled={enabled}
          locale="en-US"
          page={page}
          todayDateKey="2026-08-02"
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

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    query: queryState({ refetch: mockRefetch }),
    weeklyData,
    ...overrides,
  };
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

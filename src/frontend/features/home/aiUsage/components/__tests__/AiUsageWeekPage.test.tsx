import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AiUsageDetailPage, AiUsageModelUsage, AiUsageWeeklyData } from '../../types';
import { AiUsageWeekPage } from '../AiUsageWeekPage';

const mockModelRefetch = jest.fn();
const mockSelectDate = jest.fn();
const mockTimelineRefetch = jest.fn();
const mockUseAiUsageWeekPage = jest.fn();

jest.mock('lucide-uniwind/png', () => ({ RefreshCwIcon: () => null }));

jest.mock('../../hooks/useAiUsageWeekPage', () => ({
  useAiUsageWeekPage: (options: Record<string, unknown>) => mockUseAiUsageWeekPage(options),
}));

jest.mock('../AiUsageWeeklyChart', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    AiUsageWeeklyChart: (props: Record<string, unknown>) => (
      <MockView {...props} testID="ai-usage-weekly-chart" />
    ),
  };
});

jest.mock('../AiUsageModelList', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    AiUsageModelList: (props: Record<string, unknown>) => (
      <MockView {...props} testID="ai-usage-model-list" />
    ),
    AiUsageModelListSkeleton: () => <MockView testID="ai-usage-model-list-loading" />,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'aiUsage.lastWeek': 'Last Week',
        'aiUsage.loadError': 'Usage statistics could not be loaded.',
        'aiUsage.loading': 'Loading usage statistics',
        'aiUsage.modelLoadError': 'Model usage could not be loaded.',
        'aiUsage.modelUsage': 'Model Usage',
        'aiUsage.noUsageForDay': 'No usage on this day',
        'aiUsage.retry': 'Retry',
        'aiUsage.thisWeek': 'This Week',
      })[key] ?? key,
  }),
}));

const weeklyData: AiUsageWeeklyData = {
  averageTokens: 50,
  days: [
    { dateKey: '2026-07-27', isFuture: false, totalTokens: 100 },
    { dateKey: '2026-07-28', isFuture: false, totalTokens: 0 },
    { dateKey: '2026-07-29', isFuture: false, totalTokens: 0 },
    { dateKey: '2026-07-30', isFuture: false, totalTokens: 0 },
    { dateKey: '2026-07-31', isFuture: false, totalTokens: 0 },
    { dateKey: '2026-08-01', isFuture: false, totalTokens: 0 },
    { dateKey: '2026-08-02', isFuture: false, totalTokens: 0 },
  ],
  series: [],
  totalTokens: 100,
};
const modelUsage: AiUsageModelUsage[] = [
  {
    isOther: false,
    key: 'model-a',
    modelId: 'model-a',
    providerId: 'provider-a',
    providerName: 'Provider A',
    totalTokens: 100,
  },
];
const currentPage = pageForWeek(0, '2026-07-27', '2026-08-02');

describe('AiUsageWeekPage', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAiUsageWeekPage.mockReturnValue(queryResult());
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('shows semantic labels for current and previous weeks and date-only older headings', async () => {
    await renderPage(currentPage);
    expect(textValues()).toEqual(
      expect.arrayContaining(['This Week', 'Jul 27 - Aug 2', 'Model Usage', 'Sun, Aug 2']),
    );

    await renderPage(pageForWeek(1, '2026-07-20', '2026-07-26'));
    expect(textValues()).toEqual(expect.arrayContaining(['Last Week', 'Jul 20 - Jul 26']));

    await renderPage(pageForWeek(2, '2026-07-13', '2026-07-19'));
    expect(textValues()).toContain('Jul 13 - Jul 19');
    expect(textValues()).not.toContain('This Week');
    expect(textValues()).not.toContain('Last Week');
  });

  it('passes page-local query and selection state to the chart and model list', async () => {
    await renderPage(currentPage);

    expect(mockUseAiUsageWeekPage).toHaveBeenCalledWith({
      enabled: true,
      range: currentPage.range,
      selectedDateKey: '2026-08-02',
      todayDateKey: '2026-08-02',
    });
    const chart = renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' });
    expect(chart?.props.data).toBe(weeklyData);
    expect(chart?.props.onSelectDate).toBe(mockSelectDate);
    expect(renderer?.root.findByProps({ testID: 'ai-usage-model-list' }).props.items).toBe(
      modelUsage,
    );
  });

  it('keeps model usage visible when the weekly query fails without cache', async () => {
    mockUseAiUsageWeekPage.mockReturnValue(
      queryResult({
        timeline: queryState({ hasData: false, isError: true, refetch: mockTimelineRefetch }),
      }),
    );
    await renderPage(currentPage);

    expect(textValues()).toContain('Usage statistics could not be loaded.');
    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-weekly-chart' })).toHaveLength(0);
    expect(renderer?.root.findByProps({ testID: 'ai-usage-model-list' })).toBeDefined();

    const retryButton = renderer?.root
      .findAllByProps({ testID: 'ai-usage-week-retry-2026-07-27' })
      .find((node) => typeof node.props.onPress === 'function');
    await act(async () => retryButton?.props.onPress());
    expect(mockTimelineRefetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the chart visible while selected-day models load or fail', async () => {
    mockUseAiUsageWeekPage.mockReturnValue(
      queryResult({
        models: queryState({ hasData: false, isLoading: true, refetch: mockModelRefetch }),
      }),
    );
    await renderPage(currentPage);
    expect(renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' })).toBeDefined();
    expect(renderer?.root.findByProps({ testID: 'ai-usage-model-list-loading' })).toBeDefined();

    mockUseAiUsageWeekPage.mockReturnValue(
      queryResult({
        models: queryState({ hasData: false, isError: true, refetch: mockModelRefetch }),
      }),
    );
    await renderPage(currentPage);
    expect(textValues()).toContain('Model usage could not be loaded.');
    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-model-list' })).toHaveLength(0);
  });

  it('keeps an unloaded distant page in its fixed loading state', async () => {
    mockUseAiUsageWeekPage.mockReturnValue(
      queryResult({
        models: queryState({ hasData: false }),
        timeline: queryState({ hasData: false }),
      }),
    );
    await renderPage(currentPage, false);

    expect(renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' }).props.isLoading).toBe(
      true,
    );
    expect(renderer?.root.findByProps({ testID: 'ai-usage-model-list-loading' })).toBeDefined();
    expect(textValues()).not.toContain('No usage on this day');
  });

  async function renderPage(page: AiUsageDetailPage, enabled = true) {
    await act(async () => {
      const element = (
        <AiUsageWeekPage
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
    modelUsage,
    models: queryState({ refetch: mockModelRefetch }),
    timeline: queryState({ refetch: mockTimelineRefetch }),
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

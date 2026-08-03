import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AiUsageScreen } from '../AiUsageScreen';
import type { AiUsageModelUsage, AiUsageWeeklyData } from '../types';

const mockModelRefetch = jest.fn();
const mockSelectDate = jest.fn();
const mockTimelineRefetch = jest.fn();
const mockUseAiUsageDetail = jest.fn();

jest.mock('lucide-uniwind/png', () => ({ RefreshCwIcon: () => null }));

jest.mock('@/frontend/components/headers', () => {
  const { Text: MockText } = jest.requireActual('react-native');

  return {
    BackHeader: ({ title }: { title: string }) => (
      <MockText testID="ai-usage-header">{title}</MockText>
    ),
  };
});

jest.mock('../hooks/useAiUsageDetail', () => ({
  useAiUsageDetail: () => mockUseAiUsageDetail(),
}));

jest.mock('../components/AiUsageWeeklyChart', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    AiUsageWeeklyChart: (props: Record<string, unknown>) => (
      <MockView {...props} testID="ai-usage-weekly-chart" />
    ),
  };
});

jest.mock('../components/AiUsageModelList', () => {
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
    i18n: { language: 'en-US', resolvedLanguage: 'en-US' },
    t: (key: string) =>
      ({
        'aiUsage.loadError': 'Usage statistics could not be loaded.',
        'aiUsage.loading': 'Loading usage statistics',
        'aiUsage.modelLoadError': 'Model usage could not be loaded.',
        'aiUsage.modelUsage': 'Model Usage',
        'aiUsage.noUsageForDay': 'No usage on this day',
        'aiUsage.retry': 'Retry',
        'aiUsage.thisWeek': 'This Week',
        'aiUsage.title': 'Usage Statistics',
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

describe('AiUsageScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAiUsageDetail.mockReturnValue(queryResult());
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('renders independent weekly and selected-day sections', async () => {
    await renderScreen();

    expect(renderer?.root.findByProps({ testID: 'ai-usage-header' }).props.children).toBe(
      'Usage Statistics',
    );
    expect(textValues()).toEqual(
      expect.arrayContaining(['This Week', 'Model Usage', 'Sun, Aug 2']),
    );
    const chart = renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' });
    expect(chart?.props.data).toBe(weeklyData);
    expect(chart?.props.selectedDateKey).toBe('2026-08-02');
    expect(chart?.props.onSelectDate).toBe(mockSelectDate);
    expect(renderer?.root.findByProps({ testID: 'ai-usage-model-list' }).props.items).toBe(
      modelUsage,
    );
  });

  it('keeps model usage visible when the weekly query fails without cache', async () => {
    mockUseAiUsageDetail.mockReturnValue(
      queryResult({
        timeline: queryState({ hasData: false, isError: true, refetch: mockTimelineRefetch }),
      }),
    );

    await renderScreen();

    expect(textValues()).toContain('Usage statistics could not be loaded.');
    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-weekly-chart' })).toHaveLength(0);
    expect(renderer?.root.findByProps({ testID: 'ai-usage-model-list' })).toBeDefined();

    await act(async () => retryButton('ai-usage-week-retry')?.props.onPress());
    expect(mockTimelineRefetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the weekly chart visible when selected-day models fail without cache', async () => {
    mockUseAiUsageDetail.mockReturnValue(
      queryResult({
        models: queryState({ hasData: false, isError: true, refetch: mockModelRefetch }),
      }),
    );

    await renderScreen();

    expect(renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' })).toBeDefined();
    expect(textValues()).toContain('Model usage could not be loaded.');
    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-model-list' })).toHaveLength(0);

    await act(async () => retryButton('ai-usage-models-retry')?.props.onPress());
    expect(mockModelRefetch).toHaveBeenCalledTimes(1);
  });

  it('preserves both section heights during initial loading', async () => {
    mockUseAiUsageDetail.mockReturnValue(
      queryResult({
        models: queryState({ hasData: false, isLoading: true, refetch: mockModelRefetch }),
        timeline: queryState({ hasData: false, isLoading: true, refetch: mockTimelineRefetch }),
      }),
    );

    await renderScreen();

    expect(renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' }).props.isLoading).toBe(
      true,
    );
    expect(renderer?.root.findByProps({ testID: 'ai-usage-model-list-loading' })).toBeDefined();
  });

  it('shows a selected-day empty state without hiding the weekly chart', async () => {
    mockUseAiUsageDetail.mockReturnValue(queryResult({ modelUsage: [] }));

    await renderScreen();

    expect(textValues()).toContain('No usage on this day');
    expect(renderer?.root.findByProps({ testID: 'ai-usage-weekly-chart' })).toBeDefined();
  });

  async function renderScreen() {
    await act(async () => {
      renderer = create(<AiUsageScreen />);
    });
  }

  function textValues() {
    return renderer?.root.findAllByType(Text).map((node) => node.props.children);
  }

  function retryButton(testID: string) {
    return renderer?.root
      .findAllByProps({ testID })
      .find((node) => typeof node.props.onPress === 'function');
  }
});

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    modelUsage,
    models: queryState({ refetch: mockModelRefetch }),
    selectDate: mockSelectDate,
    selectedDateKey: '2026-08-02',
    timeline: queryState({ refetch: mockTimelineRefetch }),
    todayDateKey: '2026-08-02',
    weeklyData,
    weekRange: { from: new Date(2026, 6, 27).getTime(), to: new Date(2026, 7, 2).getTime() },
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

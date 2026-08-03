import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AiUsageOverview, AiUsageWindowKey } from '../../types';
import { AiUsageCard } from '../AiUsageCard';

const mockRefetch = jest.fn();
const mockUseAiUsageOverview = jest.fn();

jest.mock('heroui-native', () => {
  const React = jest.requireActual('react');
  const {
    Pressable: MockPressable,
    Text: MockText,
    View: MockView,
  } = jest.requireActual('react-native');
  const TabsContext = React.createContext({
    onValueChange: (_value: string) => undefined,
    value: '',
  });
  const TabsRoot = ({
    children,
    onValueChange,
    value,
    ...props
  }: {
    children?: ReactNode;
    onValueChange: (value: string) => void;
    value: string;
  }) => {
    const contextValue = React.useMemo(() => ({ onValueChange, value }), [onValueChange, value]);

    return (
      <TabsContext.Provider value={contextValue}>
        <MockView {...props}>{children}</MockView>
      </TabsContext.Provider>
    );
  };
  const TabsTrigger = ({ children, testID, value, ...props }: Record<string, unknown>) => {
    const context = React.use(TabsContext);

    return (
      <MockPressable
        {...props}
        accessibilityRole="tab"
        accessibilityState={{ selected: context.value === value }}
        testID={testID}
        onPress={() => context.onValueChange(value as string)}
      >
        {children as ReactNode}
      </MockPressable>
    );
  };
  const Tabs = Object.assign(TabsRoot, {
    Indicator: () => null,
    Label: MockText,
    List: MockView,
    Trigger: TabsTrigger,
  });

  return { Tabs };
});

jest.mock('lucide-uniwind', () => ({ RefreshCwIcon: () => null }));

jest.mock('../../hooks/useAiUsageOverview', () => ({
  useAiUsageOverview: (windowKey: AiUsageWindowKey) => mockUseAiUsageOverview(windowKey),
}));

jest.mock('../AiUsageCalendar', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    AiUsageCalendar: (props: Record<string, unknown>) => (
      <MockView {...props} testID="ai-usage-calendar" />
    ),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US', resolvedLanguage: 'en-US' },
    t: (key: string, options?: { count?: number; tokens?: string }) =>
      ({
        'home.aiUsage.activeDays': 'Active days',
        'home.aiUsage.cacheHitRate': 'Cache hit rate',
        'home.aiUsage.cacheObservedTokens': `Observable input: ${options?.tokens}`,
        'home.aiUsage.loadError': 'AI usage could not be loaded.',
        'home.aiUsage.loading': 'Loading AI usage',
        'home.aiUsage.longestStreak': `${options?.count}-day streak`,
        'home.aiUsage.peakDay': 'Peak day',
        'home.aiUsage.range.30d': '30D',
        'home.aiUsage.range.365d': '1Y',
        'home.aiUsage.range.90d': '90D',
        'home.aiUsage.retry': 'Retry',
        'home.aiUsage.title': 'AI Usage',
        'home.aiUsage.totalTokens': 'Total tokens',
      })[key] ?? key,
  }),
}));

const overview: AiUsageOverview = {
  activeDays: 4,
  cacheHitRate: 0.767,
  cacheObservedTokens: 3_599_000,
  data: { '2026-01-04': 4 },
  longestStreak: 3,
  peakDay: { dateKey: '2026-01-04', totalTokens: 900 },
  totalTokens: 1_200,
};
const calendarData = { '2025-01-05': 2, '2026-01-04': 4 } as const;
const ranges: Record<AiUsageWindowKey, { from: number; to: number }> = {
  '30d': rangeForDates(new Date(2026, 0, 4), new Date(2026, 1, 2)),
  '90d': rangeForDates(new Date(2025, 10, 5), new Date(2026, 1, 2)),
  '365d': rangeForDates(new Date(2025, 1, 3), new Date(2026, 1, 2)),
};

describe('AiUsageCard', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAiUsageOverview.mockImplementation((windowKey: AiUsageWindowKey) =>
      queryResult({ range: ranges[windowKey] }),
    );
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('renders timeline metrics and defaults to the last 30 days', async () => {
    await renderCard();

    expect(mockUseAiUsageOverview).toHaveBeenLastCalledWith('30d');
    expect(metricValue('ai-usage-total-tokens-value')).toBe('1.2K');
    expect(metricValue('ai-usage-cache-hit-rate-value')).toBe('76.7%');
    expect(metricValue('ai-usage-active-days-value')).toBe('4');
    expect(metricValue('ai-usage-peak-day-value')).toBe('900');
    expect(textValues()).toEqual(
      expect.arrayContaining(['Observable input: 3.6M', '3-day streak', 'Jan 4, 2026']),
    );
    const calendar = renderer?.root.findByProps({ testID: 'ai-usage-calendar' });
    expect(calendar?.props.data).toBe(calendarData);
    expect(calendar?.props.highlightedFromDateKey).toBe('2026-01-04');
  });

  it('changes the timeline window from the segmented control', async () => {
    await renderCard();
    const rangeButton = renderer?.root
      .findAllByProps({ testID: 'ai-usage-range-365d' })
      .find((node) => typeof node.props.onPress === 'function');

    if (!rangeButton) {
      throw new Error('365-day range button was not found.');
    }

    await act(async () => rangeButton.props.onPress());

    expect(mockUseAiUsageOverview).toHaveBeenLastCalledWith('365d');
    expect(
      renderer?.root.findByProps({ testID: 'ai-usage-calendar' }).props.highlightedFromDateKey,
    ).toBe('2025-02-03');
  });

  it('keeps the card structure and shows placeholders during its first load', async () => {
    mockUseAiUsageOverview.mockReturnValue(
      queryResult({ hasData: false, isLoading: true, overview: emptyOverview() }),
    );

    await renderCard();

    expect(metricValue('ai-usage-total-tokens-value')).toBe('--');
    expect(metricValue('ai-usage-cache-hit-rate-value')).toBe('--');
    expect(metricValue('ai-usage-active-days-value')).toBe('--');
    expect(metricValue('ai-usage-peak-day-value')).toBe('--');
    expect(renderer?.root.findByProps({ testID: 'ai-usage-calendar' }).props.isLoading).toBe(true);
  });

  it('shows a localized no-cache error and retries', async () => {
    mockUseAiUsageOverview.mockReturnValue(
      queryResult({
        error: new Error('database unavailable'),
        hasData: false,
        isError: true,
        overview: emptyOverview(),
      }),
    );

    await renderCard();

    expect(textValues()).toContain('AI usage could not be loaded.');
    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-calendar' })).toHaveLength(0);

    await act(async () => renderer?.root.findByProps({ testID: 'ai-usage-retry' }).props.onPress());
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('retains cached data and exposes retry after a refresh failure', async () => {
    mockUseAiUsageOverview.mockReturnValue(
      queryResult({ error: new Error('refresh failed'), isError: true }),
    );

    await renderCard();

    expect(renderer?.root.findByProps({ testID: 'ai-usage-calendar' })).toBeDefined();
    expect(metricValue('ai-usage-total-tokens-value')).toBe('1.2K');

    await act(async () =>
      renderer?.root.findByProps({ testID: 'ai-usage-refresh-retry' }).props.onPress(),
    );
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  async function renderCard() {
    await act(async () => {
      renderer = create(<AiUsageCard />);
    });
  }

  function metricValue(testID: string) {
    return renderer?.root
      .findAllByProps({ testID })
      .map((node) => node.props.children)
      .find((children) => typeof children === 'string');
  }

  function textValues() {
    return renderer?.root.findAllByType(Text).map((node) => node.props.children);
  }
});

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    calendarData,
    error: undefined,
    hasData: true,
    isError: false,
    isLoading: false,
    isRefreshing: false,
    overview,
    range: ranges['30d'],
    refetch: mockRefetch,
    ...overrides,
  };
}

function rangeForDates(from: Date, to: Date) {
  return { from: from.getTime(), to: to.getTime() };
}

function emptyOverview(): AiUsageOverview {
  return {
    activeDays: 0,
    cacheObservedTokens: 0,
    data: { '2026-01-04': 0 },
    longestStreak: 0,
    totalTokens: 0,
  };
}

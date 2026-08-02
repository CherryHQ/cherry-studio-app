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
    t: (key: string, options?: { count?: number }) =>
      ({
        'home.aiUsage.activeDays': 'Active days',
        'home.aiUsage.loadError': 'AI usage could not be loaded.',
        'home.aiUsage.loading': 'Loading AI usage',
        'home.aiUsage.longestStreak': `${options?.count}-day streak`,
        'home.aiUsage.peakDay': 'Peak day',
        'home.aiUsage.range.30d': '30D',
        'home.aiUsage.range.365d': '1Y',
        'home.aiUsage.range.90d': '90D',
        'home.aiUsage.requests': 'Requests',
        'home.aiUsage.retry': 'Retry',
        'home.aiUsage.title': 'AI Usage',
        'home.aiUsage.totalTokens': 'Total tokens',
      })[key] ?? key,
  }),
}));

const overview: AiUsageOverview = {
  activeDays: 4,
  data: { '2026-01-04': 4 },
  longestStreak: 3,
  peakDay: { dateKey: '2026-01-04', totalTokens: 900 },
  totalRequests: 23,
  totalTokens: 1_200,
};

describe('AiUsageCard', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAiUsageOverview.mockReturnValue(queryResult());
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('renders timeline metrics and defaults to the last 30 days', async () => {
    await renderCard();

    expect(mockUseAiUsageOverview).toHaveBeenLastCalledWith('30d');
    expect(metricValue('ai-usage-total-tokens-value')).toBe('1.2K');
    expect(metricValue('ai-usage-requests-value')).toBe('23');
    expect(metricValue('ai-usage-active-days-value')).toBe('4');
    expect(metricValue('ai-usage-peak-day-value')).toBe('900');
    expect(textValues()).toEqual(expect.arrayContaining(['3-day streak', 'Jan 4, 2026']));
    expect(renderer?.root.findByProps({ testID: 'ai-usage-calendar' }).props.windowKey).toBe('30d');
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
    expect(renderer?.root.findByProps({ testID: 'ai-usage-calendar' }).props.windowKey).toBe(
      '365d',
    );
  });

  it('keeps the card structure and shows placeholders during its first load', async () => {
    mockUseAiUsageOverview.mockReturnValue(
      queryResult({ hasData: false, isLoading: true, overview: emptyOverview() }),
    );

    await renderCard();

    expect(metricValue('ai-usage-total-tokens-value')).toBe('--');
    expect(metricValue('ai-usage-requests-value')).toBe('--');
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
    error: undefined,
    hasData: true,
    isError: false,
    isLoading: false,
    isRefreshing: false,
    overview,
    refetch: mockRefetch,
    ...overrides,
  };
}

function emptyOverview(): AiUsageOverview {
  return {
    activeDays: 0,
    data: { '2026-01-04': 0 },
    longestStreak: 0,
    totalRequests: 0,
    totalTokens: 0,
  };
}

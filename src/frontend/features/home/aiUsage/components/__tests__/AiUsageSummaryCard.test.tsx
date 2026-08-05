import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AiUsageSummaryCard } from '../AiUsageSummaryCard';

const mockRefetch = jest.fn();
const mockUseAiUsageOverview = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');

  return {
    Link: ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement('MockLink', props, children),
  };
});

jest.mock('lucide-uniwind/png', () => ({
  ChevronRightIcon: () => null,
  RefreshCwIcon: () => null,
}));

jest.mock('@cherrystudio/ui/icons', () => ({
  resolveProviderIcon: (providerId: string) => ({
    dark: `${providerId}-dark`,
    light: `${providerId}-light`,
  }),
}));

jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({}),
  useUniwind: () => ({ theme: 'light' }),
}));

jest.mock('@/frontend/components/BrandAvatar', () => {
  const React = jest.requireActual('react');

  return {
    BrandAvatar: ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement('MockBrandAvatar', props, children),
    BrandAvatarIcon: (props: Record<string, unknown>) =>
      React.createElement('MockBrandAvatarIcon', props),
  };
});

jest.mock('../../hooks/useAiUsageOverview', () => ({
  useAiUsageOverview: () => mockUseAiUsageOverview(),
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
    t: (key: string) =>
      ({
        'aiUsage.cost': 'Cost',
        'aiUsage.loadError': 'Usage statistics could not be loaded.',
        'aiUsage.loading': 'Loading usage statistics',
        'aiUsage.retry': 'Retry',
        'aiUsage.tokens': 'Tokens',
        'aiUsage.title': 'Usage Statistics',
        'aiUsage.unknownProvider': 'Unknown provider',
        'aiUsage.viewDetails': 'View details',
      })[key] ?? key,
  }),
}));

const calendarData = {
  '2026-02-01': 0,
  '2026-04-15': 2,
  '2026-08-02': 4,
} as const;
const range = {
  from: new Date(2026, 1, 1).getTime(),
  to: new Date(2026, 7, 2, 23, 59, 59, 999).getTime(),
};

describe('AiUsageSummaryCard', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAiUsageOverview.mockReturnValue(queryResult());
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('renders a fitted six-month summary with a detail link', async () => {
    await renderCard();

    expect(mockUseAiUsageOverview).toHaveBeenLastCalledWith();
    expect(renderer?.root.findByType('MockLink').props.href).toBe('/home/ai-usage');

    const calendar = renderer?.root.findByProps({ testID: 'ai-usage-calendar' });
    expect(calendar?.props.data).toBe(calendarData);
    expect(calendar?.props.animationStartDateKey).toBe('2026-04-15');
    expect(calendar?.props.layout).toBe('fit');
    expect(textValues()).toEqual(
      expect.arrayContaining([
        'Usage Statistics',
        'View details',
        '2,235,732',
        'Tokens',
        '$1,227.37',
        'Cost',
        'Anthropic',
        'OpenAI',
        'Google',
      ]),
    );
    expect(renderer?.root.findByProps({ testID: 'ai-usage-summary-metrics' }).props.className).toBe(
      'mt-4 flex-row gap-6',
    );
    expect(
      renderer?.root.findByProps({ testID: 'ai-usage-summary-providers' }).props.className,
    ).toBe('mt-4 min-h-6 flex-row items-center gap-2');
    expect(
      renderer?.root.findByProps({ testID: 'ai-usage-summary-provider-openai' }).props.className,
    ).toBe('min-w-0 flex-1 flex-row items-center gap-2');
    expect(textValues()).not.toEqual(
      expect.arrayContaining(['Total tokens', 'Cache hit rate', 'Daily activity']),
    );
  });

  it('keeps the summary calendar mounted during its first load', async () => {
    mockUseAiUsageOverview.mockReturnValue(
      queryResult({ data: undefined, hasData: false, isLoading: true }),
    );

    await renderCard();

    expect(renderer?.root.findByProps({ testID: 'ai-usage-calendar' }).props.isLoading).toBe(true);
    expect(textValues()).toContain('--');
  });

  it('keeps cost totals separated by currency', async () => {
    mockUseAiUsageOverview.mockReturnValue(
      queryResult({
        data: {
          buckets: [],
          costTotals: [
            { currency: 'CNY', total: 48 },
            { currency: 'USD', total: 12.3 },
          ],
          dailyCosts: [],
        },
      }),
    );

    await renderCard();

    expect(textValues()).toContain('¥48.00 · $12.30');
  });

  it('shows a localized no-cache error and retries', async () => {
    mockUseAiUsageOverview.mockReturnValue(
      queryResult({
        error: new Error('database unavailable'),
        hasData: false,
        isError: true,
      }),
    );

    await renderCard();

    expect(textValues()).toContain('Usage statistics could not be loaded.');
    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-calendar' })).toHaveLength(0);

    await act(async () =>
      renderer?.root.findByProps({ testID: 'ai-usage-summary-retry' }).props.onPress(),
    );
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  async function renderCard() {
    await act(async () => {
      renderer = create(<AiUsageSummaryCard />);
    });
  }

  function textValues() {
    return renderer?.root.findAllByType(Text).map((node) => node.props.children);
  }
});

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    calendarData,
    data: {
      buckets: [
        { date: '2026-08-01', totalTokens: 1_500_000 },
        { date: '2026-08-02', totalTokens: 735_732 },
      ],
      costTotals: [{ currency: 'USD', total: 1227.37 }],
      dailyCosts: [],
    },
    error: undefined,
    hasData: true,
    isError: false,
    isLoading: false,
    isRefreshing: false,
    range,
    refetch: mockRefetch,
    topProviders: [
      { groupBy: 'provider', providerId: 'anthropic', providerName: 'Anthropic' },
      { groupBy: 'provider', providerId: 'openai', providerName: 'OpenAI' },
      { groupBy: 'provider', providerId: 'google', providerName: 'Google' },
    ],
    ...overrides,
  };
}

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
    t: (key: string) =>
      ({
        'aiUsage.loadError': 'Usage statistics could not be loaded.',
        'aiUsage.loading': 'Loading usage statistics',
        'aiUsage.retry': 'Retry',
        'aiUsage.title': 'Usage Statistics',
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
    expect(textValues()).toEqual(expect.arrayContaining(['Usage Statistics', 'View details']));
    expect(textValues()).not.toEqual(
      expect.arrayContaining(['Total tokens', 'Cache hit rate', 'Daily activity']),
    );
  });

  it('keeps the summary calendar mounted during its first load', async () => {
    mockUseAiUsageOverview.mockReturnValue(queryResult({ hasData: false, isLoading: true }));

    await renderCard();

    expect(renderer?.root.findByProps({ testID: 'ai-usage-calendar' }).props.isLoading).toBe(true);
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
    error: undefined,
    hasData: true,
    isError: false,
    isLoading: false,
    isRefreshing: false,
    range,
    refetch: mockRefetch,
    ...overrides,
  };
}

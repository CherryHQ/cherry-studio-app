import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AiUsageDetailPage, AiUsageRankingItem } from '../../types';
import { AiUsageRankingSection } from '../AiUsageRankingSection';

const mockRefetch = jest.fn();
const mockUseAiUsageRanking = jest.fn();

jest.mock('lucide-uniwind/png', () => ({ RefreshCwIcon: () => null }));
jest.mock('../../hooks/useAiUsageRanking', () => ({
  useAiUsageRanking: (options: Record<string, unknown>) => mockUseAiUsageRanking(options),
}));
jest.mock('../AiUsageRankingList', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    AiUsageRankingList: ({
      emptyState,
      items,
      listHeaderComponent,
      ...props
    }: Record<string, unknown>) => (
      <MockView {...props} items={items} testID="ai-usage-ranking-list">
        {listHeaderComponent}
        {(items as unknown[]).length === 0 ? emptyState : null}
      </MockView>
    ),
    AiUsageRankingListSkeleton: () => <MockView testID="ai-usage-ranking-list-loading" />,
  };
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'aiUsage.loading': 'Loading usage statistics',
        'aiUsage.mostUsed': 'Most Used',
        'aiUsage.noUsageForDay': 'No usage on this day',
        'aiUsage.rankingLoadError': 'Usage ranking could not be loaded.',
        'aiUsage.retry': 'Retry',
        'aiUsage.showModels': 'Show Models',
        'aiUsage.showProviders': 'Show Providers',
      })[key] ?? key,
  }),
}));

const ranking: AiUsageRankingItem[] = [
  {
    groupBy: 'model',
    isOther: false,
    key: 'model-a',
    modelId: 'model-a',
    providerId: 'provider-a',
    providerName: 'Provider A',
    totalTokens: 100,
  },
];
const page = pageForWeek();

describe('AiUsageRankingSection', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAiUsageRanking.mockReturnValue(queryResult());
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  test('queries the selected date and toggles between models and providers', async () => {
    await renderSection();

    expect(mockUseAiUsageRanking).toHaveBeenLastCalledWith({
      enabled: true,
      groupBy: 'model',
      selectedDateKey: '2026-08-02',
    });
    expect(textValues()).toEqual(expect.arrayContaining(['Most Used', 'Show Providers']));
    expect(textValues()).not.toContain('Sun, Aug 2');
    expect(renderer?.root.findByProps({ testID: 'ai-usage-ranking-list' }).props.items).toBe(
      ranking,
    );

    await act(async () =>
      renderer?.root.findByProps({ testID: 'ai-usage-toggle-ranking-group' }).props.onPress(),
    );
    expect(mockUseAiUsageRanking).toHaveBeenLastCalledWith({
      enabled: true,
      groupBy: 'provider',
      selectedDateKey: '2026-08-02',
    });
    expect(textValues()).toContain('Show Models');
  });

  test('shows loading, empty, and no-cache error states locally', async () => {
    mockUseAiUsageRanking.mockReturnValue(
      queryResult({ query: queryState({ hasData: false, isLoading: true }) }),
    );
    await renderSection();
    expect(renderer?.root.findByProps({ testID: 'ai-usage-ranking-list-loading' })).toBeDefined();

    mockUseAiUsageRanking.mockReturnValue(queryResult({ ranking: [] }));
    await renderSection();
    expect(textValues()).toContain('No usage on this day');

    mockUseAiUsageRanking.mockReturnValue(
      queryResult({
        query: queryState({ hasData: false, isError: true, refetch: mockRefetch }),
        ranking: [],
      }),
    );
    await renderSection();
    expect(textValues()).toContain('Usage ranking could not be loaded.');
    const retry = renderer?.root
      .findAllByProps({ testID: 'ai-usage-ranking-retry-2026-07-27' })
      .find((node) => typeof node.props.onPress === 'function');
    await act(async () => retry?.props.onPress());
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  async function renderSection() {
    await act(async () => {
      const element = (
        <AiUsageRankingSection
          enabled
          listHeaderComponent={<View testID="ai-usage-screen-header" />}
          locale="en-US"
          page={page}
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

function pageForWeek(): AiUsageDetailPage {
  return {
    key: '2026-07-27',
    range: {
      from: new Date(2026, 6, 27).getTime(),
      to: new Date(2026, 7, 2, 23, 59, 59, 999).getTime(),
    },
    selectedDateKey: '2026-08-02',
    weeksAgo: 0,
  };
}

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    query: queryState({ refetch: mockRefetch }),
    ranking,
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

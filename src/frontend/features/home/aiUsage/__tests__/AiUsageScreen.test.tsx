import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AiUsageScreen } from '../AiUsageScreen';
import type { AiUsageDetailPage } from '../types';

const mockSelectDate = jest.fn();
const mockSelectPage = jest.fn();
const mockUseAiUsageDetail = jest.fn();

jest.mock('expo-router/react-navigation', () => ({
  useHeaderHeight: () => 96,
}));
jest.mock('@/frontend/utils/constants', () => ({
  isLiquidGlassAvailable: true,
}));
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
jest.mock('../components/AiUsageWeeklySection', () => {
  const React = jest.requireActual('react');
  return {
    AiUsageWeeklySection: (props: Record<string, unknown>) =>
      React.createElement('AiUsageWeeklySectionMock', props),
  };
});
jest.mock('../components/AiUsageRankingSection', () => {
  const React = jest.requireActual('react');
  return {
    AiUsageRankingSection: ({ listHeaderComponent, ...props }: Record<string, unknown>) =>
      React.createElement('AiUsageRankingSectionMock', props, listHeaderComponent),
  };
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US', resolvedLanguage: 'en-US' },
    t: (key: string) => ({ 'aiUsage.title': 'Usage Statistics' })[key] ?? key,
  }),
}));

const pages = buildPages();

describe('AiUsageScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAiUsageDetail.mockReturnValue(detailResult());
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  test('gives the weekly section to the ranking list as its scroll header', async () => {
    await renderScreen();

    expect(renderer?.root.findByProps({ testID: 'ai-usage-content' }).props.style).toEqual({
      paddingTop: 96,
    });
    expect(renderer?.root.findByProps({ testID: 'ai-usage-header' }).props.children).toBe(
      'Usage Statistics',
    );

    const weekly = weeklySection();
    expect(weekly.props.activePageIndex).toBe(7);
    expect(weekly.props.pages).toBe(pages);
    expect(weekly.props.weekDataKey).toBe(pages[7]?.key);
    expect(weekly.props.onSelectDate).toBe(mockSelectDate);
    expect(weekly.props.onSelectPage).toBe(mockSelectPage);

    const ranking = rankingSection();
    expect(ranking.props.enabled).toBe(true);
    expect(ranking.props.page).toBe(pages[7]);
    expect(ranking.props.children.props.activePageIndex).toBe(weekly.props.activePageIndex);
  });

  test('moves only the lower ranking section when the active week changes', async () => {
    await renderScreen();
    mockUseAiUsageDetail.mockReturnValue(detailResult({ activePageIndex: 6 }));
    await act(async () => renderer?.update(<AiUsageScreen />));

    expect(weeklySection().props.activePageIndex).toBe(6);
    expect(rankingSection().props.page).toBe(pages[6]);
  });

  async function renderScreen() {
    await act(async () => {
      renderer = create(<AiUsageScreen />);
    });
  }

  function weeklySection() {
    return renderer!.root.find((node) => node.type === 'AiUsageWeeklySectionMock');
  }

  function rankingSection() {
    return renderer!.root.find((node) => node.type === 'AiUsageRankingSectionMock');
  }
});

function detailResult(overrides: Record<string, unknown> = {}) {
  return {
    activePageIndex: 7,
    pages,
    selectDate: mockSelectDate,
    selectPage: mockSelectPage,
    todayDateKey: '2026-08-02',
    weekDataKey: pages[7]!.key,
    ...overrides,
  };
}

function buildPages(): AiUsageDetailPage[] {
  const firstMonday = new Date(2026, 5, 8);

  return Array.from({ length: 8 }, (_, index) => {
    const monday = new Date(firstMonday);
    monday.setDate(monday.getDate() + index * 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    return {
      key: localDateKey(monday),
      range: {
        from: monday.getTime(),
        to: new Date(
          sunday.getFullYear(),
          sunday.getMonth(),
          sunday.getDate(),
          23,
          59,
          59,
          999,
        ).getTime(),
      },
      selectedDateKey: localDateKey(sunday),
      weeksAgo: 7 - index,
    };
  });
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

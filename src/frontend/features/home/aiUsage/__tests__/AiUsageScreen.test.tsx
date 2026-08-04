import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AiUsageScreen } from '../AiUsageScreen';
import type { AiUsageDetailPage } from '../types';

const mockSelectDate = jest.fn();
const mockSelectPage = jest.fn();
const mockSetPageWithoutAnimation = jest.fn();
const mockUseAiUsageDetail = jest.fn();

jest.mock('expo-router/react-navigation', () => ({
  useHeaderHeight: () => 96,
}));

jest.mock('@expo/ui/community/pager-view', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(function MockPagerView(
      props: Record<string, unknown>,
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        setPageWithoutAnimation: mockSetPageWithoutAnimation,
      }));
      return <MockView {...props} />;
    }),
  };
});

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

jest.mock('../components/AiUsageWeekPage', () => {
  const React = jest.requireActual('react');
  return {
    AiUsageWeekPage: (props: { page: AiUsageDetailPage }) =>
      React.createElement('AiUsageWeekPageMock', {
        ...props,
        testID: `week-content-${props.page.key}`,
      }),
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

  it('renders eight native pager pages and starts on the current week', async () => {
    await renderScreen();

    expect(renderer?.root.findByProps({ testID: 'ai-usage-content' }).props.style).toEqual({
      paddingTop: 96,
    });
    expect(renderer?.root.findByProps({ testID: 'ai-usage-header' }).props.children).toBe(
      'Usage Statistics',
    );
    const pager = renderer?.root.findByProps({ testID: 'ai-usage-pager' });
    expect(pager?.props.initialPage).toBe(7);
    expect(pager?.props.offscreenPageLimit).toBe(1);
    expect(mockSetPageWithoutAnimation).toHaveBeenCalledWith(7);
    expect(weekContentNodes()).toHaveLength(8);
    expect(
      pages.every((page) =>
        renderer?.root
          .findAllByProps({ testID: `ai-usage-week-page-${page.key}` })
          .some((node) => node.props.collapsable === false),
      ),
    ).toBe(true);
    expect(weekContentNodes().map((node) => node.props.enabled)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it('updates the active page and preloads both adjacent weeks', async () => {
    await renderScreen();
    const pager = renderer?.root.findByProps({ testID: 'ai-usage-pager' });
    mockSetPageWithoutAnimation.mockClear();

    await act(async () => pager?.props.onPageSelected({ nativeEvent: { position: 6 } }));
    expect(mockSelectPage).toHaveBeenCalledWith(6);

    mockUseAiUsageDetail.mockReturnValue(detailResult({ activePageIndex: 6 }));
    await act(async () => renderer?.update(<AiUsageScreen />));
    expect(mockSetPageWithoutAnimation).toHaveBeenCalledWith(6);
    expect(weekContentNodes().map((node) => node.props.enabled)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  it('routes date selection to the owning week', async () => {
    await renderScreen();
    const previousWeek = renderer?.root.findByProps({ testID: `week-content-${pages[6]!.key}` });

    await act(async () => previousWeek?.props.onSelectDate('2026-07-21'));
    expect(mockSelectDate).toHaveBeenCalledWith(pages[6]!.key, '2026-07-21');
  });

  async function renderScreen() {
    await act(async () => {
      renderer = create(<AiUsageScreen />);
    });
  }

  function weekContentNodes() {
    return renderer?.root.findAll((node) => node.type === 'AiUsageWeekPageMock') ?? [];
  }
});

function detailResult(overrides: Record<string, unknown> = {}) {
  return {
    activePageIndex: 7,
    pagerKey: pages[7]!.key,
    pages,
    selectDate: mockSelectDate,
    selectPage: mockSelectPage,
    todayDateKey: '2026-08-02',
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
    const key = localDateKey(monday);

    return {
      key,
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

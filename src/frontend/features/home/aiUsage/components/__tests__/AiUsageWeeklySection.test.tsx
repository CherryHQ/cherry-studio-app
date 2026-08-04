import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AiUsageDetailPage } from '../../types';
import { AiUsageWeeklySection } from '../AiUsageWeeklySection';

const mockScrollToIndex = jest.fn(async () => undefined);
const mockSelectDate = jest.fn();
const mockSelectPage = jest.fn();

jest.mock('@legendapp/list/react-native', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');

  return {
    LegendList: React.forwardRef(function MockLegendList(
      props: {
        data: readonly unknown[];
        extraData: unknown;
        renderItem: (options: Record<string, unknown>) => React.ReactNode;
      } & Record<string, unknown>,
      ref: React.Ref<unknown>,
    ) {
      const { data, extraData, renderItem, ...viewProps } = props;
      React.useImperativeHandle(ref, () => ({ scrollToIndex: mockScrollToIndex }));

      return (
        <MockView {...viewProps} data={data} extraData={extraData} renderItem={renderItem}>
          {data.map((item, index) => (
            <React.Fragment key={(item as { key?: string }).key ?? index}>
              {renderItem({ data, extraData, index, item, type: undefined })}
            </React.Fragment>
          ))}
        </MockView>
      );
    }),
  };
});

jest.mock('../AiUsageWeekChartPage', () => {
  const React = jest.requireActual('react');
  return {
    AiUsageWeekChartPage: (props: Record<string, unknown>) =>
      React.createElement('AiUsageWeekChartPageMock', props),
  };
});
jest.mock('lucide-uniwind/png', () => ({ RefreshCwIcon: () => null }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'aiUsage.showThisWeek': 'Show This Week',
        'aiUsage.tokenUsage': 'Token Usage',
      })[key] ?? key,
  }),
}));

const pages = buildPages();

describe('AiUsageWeeklySection', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  test('uses a fixed horizontal LegendList and enables the current adjacent weeks', async () => {
    await renderSection(7);
    const list = renderer?.root.findByProps({ testID: 'ai-usage-week-list' });

    expect(list?.props.horizontal).toBe(true);
    expect(list?.props.pagingEnabled).toBe(true);
    expect(list?.props.initialScrollIndex).toBe(7);
    expect(list?.props.snapToInterval).toBe(320);
    expect(list?.props.drawDistance).toBe(320);
    expect(list?.props.recycleItems).toBe(true);
    expect(list?.props.style).toEqual({ height: 350 });
    expect(list?.props.dataKey).toBe('2026-07-27');
    expect(list?.props.getFixedItemSize()).toBe(320);
    expect(mockScrollToIndex).toHaveBeenCalledWith({ animated: false, index: 7 });
    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-show-current-week' })).toHaveLength(0);
    expect(chartNodes().map((node) => node.props.enabled)).toEqual([
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

  test('settles to a week, updates adjacent rows, and routes date selection', async () => {
    await renderSection(7);
    const list = renderer?.root.findByProps({ testID: 'ai-usage-week-list' });

    await act(async () =>
      list?.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 6 * 320 } } }),
    );
    expect(mockSelectPage).toHaveBeenCalledWith(6);

    await act(async () => chartNodes()[6]?.props.onSelectDate('2026-07-21'));
    expect(mockSelectDate).toHaveBeenCalledWith(pages[6]?.key, '2026-07-21');

    mockScrollToIndex.mockClear();
    await updateSection(6);
    expect(mockScrollToIndex).not.toHaveBeenCalled();
    expect(chartNodes().map((node) => node.props.enabled)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);

    const showCurrentWeek = renderer?.root
      .findAllByProps({ testID: 'ai-usage-show-current-week' })
      .find(
        (node) =>
          typeof node.props.onPress === 'function' && typeof node.props.className === 'string',
      );
    expect(showCurrentWeek?.props.className).not.toContain('py-1.5');
    expect(showCurrentWeek?.props.hitSlop).toBe(10);
    await act(async () => showCurrentWeek?.props.onPress());
    expect(mockScrollToIndex).toHaveBeenCalledWith({ animated: true, index: 7 });
    expect(mockSelectPage).toHaveBeenLastCalledWith(7);
  });

  async function renderSection(activePageIndex: number) {
    await act(async () => {
      renderer = create(section(activePageIndex));
    });
    const wrapper = renderer?.root.findByProps({ testID: 'ai-usage-week-viewport' });
    await act(async () =>
      wrapper?.props.onLayout({ nativeEvent: { layout: { height: 360, width: 320, x: 0, y: 0 } } }),
    );
  }

  async function updateSection(activePageIndex: number) {
    await act(async () => renderer?.update(section(activePageIndex)));
  }

  function section(activePageIndex: number) {
    return (
      <AiUsageWeeklySection
        activePageIndex={activePageIndex}
        locale="en-US"
        pages={pages}
        todayDateKey="2026-08-02"
        weekDataKey="2026-07-27"
        onSelectDate={mockSelectDate}
        onSelectPage={mockSelectPage}
      />
    );
  }

  function chartNodes() {
    return renderer?.root.findAll((node) => node.type === 'AiUsageWeekChartPageMock') ?? [];
  }
});

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

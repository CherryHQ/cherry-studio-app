import type { ComponentType } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { aiUsageCalendar } from '@/frontend/utils/constants';

import { AiUsageCalendar } from '../AiUsageCalendar';

jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  const actual = jest.requireActual('react-native');
  const { Platform, Pressable, StyleSheet, Text, View } = actual;
  const mockScrollToEnd = jest.fn();
  const MockScrollView = React.forwardRef(function MockScrollView(
    { children, ...props }: { children?: React.ReactNode },
    ref: React.Ref<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({ scrollToEnd: mockScrollToEnd }));
    return <View {...props}>{children}</View>;
  });

  return {
    __mockScrollToEnd: mockScrollToEnd,
    Platform,
    Pressable,
    ScrollView: MockScrollView,
    StyleSheet,
    Text,
    View,
  };
});

// Echoes each name back so the five levels stay distinct: the legend keys on the
// colour value, and a mock returning one constant would collide five ways.
jest.mock('uniwind', () => ({
  useCSSVariable: (names: string[]) => names.map((name) => `resolved${name}`),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US', resolvedLanguage: 'en-US' },
    t: (key: string, options?: { count?: number }) =>
      ({
        'aiUsage.activeDays': `${options?.count} active days`,
        'aiUsage.less': 'Less',
        'aiUsage.more': 'More',
        'aiUsage.replay': 'Replay usage animation',
      })[key] ?? key,
  }),
}));

jest.mock('../AiUsageSquare', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');
  const mockReplayAnimation = jest.fn();

  return {
    __mockReplayAnimation: mockReplayAnimation,
    AiUsageSquare: ({ ref, ...props }: { ref: React.Ref<unknown> } & Record<string, unknown>) => {
      React.useImperativeHandle(ref, () => ({ replayAnimation: mockReplayAnimation }));
      return <MockView {...props} />;
    },
  };
});

const { __mockScrollToEnd: mockScrollToEnd } = jest.requireMock('react-native') as {
  __mockScrollToEnd: jest.Mock;
};
const { __mockReplayAnimation: mockReplayAnimation, AiUsageSquare: MockAiUsageSquare } =
  jest.requireMock('../AiUsageSquare') as {
    __mockReplayAnimation: jest.Mock;
    AiUsageSquare: ComponentType<Record<string, unknown>>;
  };

describe('AiUsageCalendar', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps the detail year scrollable and returns to the latest dates', async () => {
    await act(async () => {
      renderer = create(
        <AiUsageCalendar
          animationStartDateKey="2026-07-04"
          data={{ '2025-08-03': 1, '2026-08-02': 4 }}
          isLoading={false}
          layout="scroll"
        />,
      );
    });

    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: false });
    mockScrollToEnd.mockClear();

    await act(async () => {
      renderer?.update(
        <AiUsageCalendar
          animationStartDateKey="2026-05-05"
          data={{ '2025-08-03': 1, '2026-08-02': 4 }}
          isLoading={false}
          layout="scroll"
        />,
      );
    });

    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: false });
    mockScrollToEnd.mockClear();
    scrollProps().onContentSizeChange();
    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: false });
  });

  it('fits the 183-day summary into exactly 27 columns without a scroll view', async () => {
    await act(async () => {
      renderer = create(
        <AiUsageCalendar
          animationStartDateKey="2026-02-01"
          data={{ '2026-02-01': 1, '2026-08-02': 4 }}
          isLoading={false}
          layout="fit"
        />,
      );
    });

    const calendar = renderer?.root.findByProps({ testID: 'ai-usage-calendar' });
    await act(async () => calendar?.props.onLayout({ nativeEvent: { layout: { width: 324 } } }));

    expect(renderer?.root.findAllByProps({ testID: 'ai-usage-calendar-scroll' })).toHaveLength(0);
    const squareProps = renderer?.root.findAllByType(MockAiUsageSquare).map((node) => node.props);
    const expectedCellSize = (324 - aiUsageCalendar.summaryCellGap * 26) / 27;
    expect(squareProps).toHaveLength(183);
    expect(squareProps?.every((props) => props.cellSize === expectedCellSize)).toBe(true);
    expect(renderer?.root.findByProps({ testID: 'ai-usage-active-days' }).props.children).toBe(
      '2 active days',
    );
    const legendLevelTestIDs = new Set(
      renderer?.root
        .findAll((node) => /^ai-usage-legend-level-\d$/.test(node.props.testID))
        .map((node) => node.props.testID),
    );
    expect(legendLevelTestIDs).toEqual(
      new Set(Array.from({ length: 5 }, (_, level) => `ai-usage-legend-level-${level}`)),
    );
    const firstLegendLevel = renderer?.root.findByProps({ testID: 'ai-usage-legend-level-0' });
    expect(firstLegendLevel?.props.className).toBe('size-3');

    const summary = renderer?.root.findByProps({ testID: 'ai-usage-calendar-summary' });
    const legend = renderer?.root.findByProps({ testID: 'ai-usage-calendar-legend' });
    expect(summary?.props.className).not.toContain('bg-');
    expect(legend?.props.className).not.toContain('bg-');
  });

  it('dims dates before usage begins and rebases the wave to its first active week', async () => {
    await act(async () => {
      renderer = create(
        <AiUsageCalendar
          animationStartDateKey="2026-01-20"
          data={{ '2026-01-01': 1, '2026-02-01': 4 }}
          isLoading={false}
          layout="scroll"
        />,
      );
    });

    const squareProps = renderer?.root.findAllByType(MockAiUsageSquare).map((node) => node.props);
    expect(squareProps?.some((props) => props.isHighlighted === false)).toBe(true);
    expect(squareProps?.some((props) => props.isHighlighted === true)).toBe(true);
    expect(
      Math.min(
        ...(squareProps ?? [])
          .filter((props) => props.isHighlighted === true)
          .map((props) => props.weekIndex as number),
      ),
    ).toBe(0);
  });

  it('replays the wave when the heatmap area is pressed', async () => {
    await act(async () => {
      renderer = create(
        <AiUsageCalendar
          animationStartDateKey="2026-01-01"
          data={{ '2026-01-01': 4 }}
          isLoading={false}
          layout="fit"
        />,
      );
    });
    mockReplayAnimation.mockClear();

    const heatmap = renderer?.root
      .findAllByProps({ testID: 'ai-usage-calendar-replay' })
      .find((node) => typeof node.props.onPress === 'function');
    if (!heatmap) {
      throw new Error('AI usage heatmap button was not found.');
    }

    await act(async () => heatmap.props.onPress());
    expect(mockReplayAnimation).toHaveBeenCalledTimes(1);
  });

  function scrollProps() {
    const node = renderer?.root
      .findAllByProps({ testID: 'ai-usage-calendar-scroll' })
      .find((item) => typeof item.props.onContentSizeChange === 'function');
    if (!node) {
      throw new Error('AI usage calendar scroll view was not found.');
    }
    return node.props;
  }
});

import type { ComponentType } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

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

jest.mock('lucide-uniwind', () => ({ PlayIcon: () => null }));

jest.mock('uniwind', () => ({ useUniwind: () => ({ theme: 'light' }) }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US', resolvedLanguage: 'en-US' },
    t: (key: string) =>
      ({
        'home.aiUsage.dailyActivity': 'Daily activity',
        'home.aiUsage.replay': 'Replay activity animation',
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

  it('keeps the year scrollable and returns to the latest dates when the highlight changes', async () => {
    await act(async () => {
      renderer = create(
        <AiUsageCalendar
          data={{ '2025-08-03': 1, '2026-08-02': 4 }}
          highlightedFromDateKey="2026-07-04"
          isLoading={false}
        />,
      );
    });

    expect(scrollProps().scrollEnabled).toBe(true);
    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: false });
    mockScrollToEnd.mockClear();

    await act(async () => {
      renderer?.update(
        <AiUsageCalendar
          data={{ '2025-08-03': 1, '2026-08-02': 4 }}
          highlightedFromDateKey="2026-05-05"
          isLoading={false}
        />,
      );
    });

    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: false });
    mockScrollToEnd.mockClear();
    scrollProps().onContentSizeChange();
    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: false });
  });

  it('dims older dates and rebases the highlighted wave to its first week', async () => {
    await act(async () => {
      renderer = create(
        <AiUsageCalendar
          data={{ '2026-01-01': 1, '2026-02-01': 4 }}
          highlightedFromDateKey="2026-01-20"
          isLoading={false}
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

  it('replays the square wave from the activity control', async () => {
    await act(async () => {
      renderer = create(
        <AiUsageCalendar
          data={{ '2026-01-01': 4 }}
          highlightedFromDateKey="2026-01-01"
          isLoading={false}
        />,
      );
    });
    mockReplayAnimation.mockClear();

    const replayButton = renderer?.root
      .findAllByProps({ testID: 'ai-usage-replay' })
      .find((node) => typeof node.props.onPress === 'function');
    if (!replayButton) {
      throw new Error('AI usage replay button was not found.');
    }

    await act(async () => replayButton.props.onPress());
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

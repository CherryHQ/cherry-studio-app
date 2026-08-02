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
    AiUsageSquare: ({ ref, ...props }: { ref: React.Ref<unknown> }) => {
      React.useImperativeHandle(ref, () => ({ replayAnimation: mockReplayAnimation }));
      return <MockView {...props} />;
    },
  };
});

const { __mockScrollToEnd: mockScrollToEnd } = jest.requireMock('react-native') as {
  __mockScrollToEnd: jest.Mock;
};
const { __mockReplayAnimation: mockReplayAnimation } = jest.requireMock('../AiUsageSquare') as {
  __mockReplayAnimation: jest.Mock;
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

  it('centers short windows and enables scrolling only for the 365-day window', async () => {
    await act(async () => {
      renderer = create(
        <AiUsageCalendar data={{ '2026-01-01': 1 }} isLoading={false} windowKey="30d" />,
      );
    });

    expect(scrollProps().scrollEnabled).toBe(false);
    scrollProps().onContentSizeChange();
    expect(mockScrollToEnd).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.update(
        <AiUsageCalendar data={{ '2026-01-01': 1 }} isLoading={false} windowKey="365d" />,
      );
    });

    expect(scrollProps().scrollEnabled).toBe(true);
    scrollProps().onContentSizeChange();
    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: false });
  });

  it('replays the square wave from the activity control', async () => {
    await act(async () => {
      renderer = create(
        <AiUsageCalendar data={{ '2026-01-01': 4 }} isLoading={false} windowKey="30d" />,
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

import { StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { duration } from '../../../motion';
import { Tabs } from '../tabs.ios';

jest.mock('expo-glass-effect', () => ({
  GlassView: () => {
    throw new Error('GlassView must not render when Liquid Glass is unavailable.');
  },
  isGlassEffectAPIAvailable: () => false,
  isLiquidGlassAvailable: () => false,
}));

jest.mock('react-native-reanimated', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View: MockView },
    Easing: { bezier: () => 'bezier' },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withTiming: jest.fn((value: number) => value),
  };
});

const items = [
  { label: 'Messages', testID: 'messages-tab', value: 'messages' },
  { disabled: true, label: 'Settings', testID: 'settings-tab', value: 'settings' },
] as const;

describe('Tabs.ios fallback', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  it('preserves the complete tab geometry and behavior on a token surface', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <Tabs
          items={items}
          onValueChange={onValueChange}
          style={{ width: 144 }}
          testID="account-tabs"
          value="messages"
        />,
      );
    });

    const root = renderer!.root.findByProps({ testID: 'account-tabs' });
    const frame = renderer!.root
      .findAllByType(View)
      .find((node) => node.props.className === 'overflow-hidden rounded-[17px] bg-secondary');
    const messages = renderer!.root.findByProps({ testID: 'messages-tab' });
    const settings = renderer!.root.findByProps({ testID: 'settings-tab' });

    expect(frame).toBeDefined();
    expect(StyleSheet.flatten(root.props.style)).toMatchObject({ width: 144 });
    expect(frame!.props.style).toMatchObject({ borderRadius: 17, height: 34, width: '100%' });
    expect(messages.props).toMatchObject({
      accessibilityState: { disabled: undefined, selected: true },
      hitSlop: { bottom: 5, top: 5 },
    });
    expect(settings.props.accessibilityState).toEqual({ disabled: true, selected: false });
    expect(renderer!.root.findAllByType(Text).map((label) => label.props.children)).toEqual([
      'Messages',
      'Settings',
    ]);

    act(() => messages.props.onPress());
    expect(onValueChange).toHaveBeenCalledWith('messages');

    act(() =>
      frame!.props.onLayout({
        nativeEvent: { layout: { height: 34, width: 300, x: 0, y: 0 } },
      }),
    );
    expect(renderer!.root.findByProps({ testID: 'account-tabs-indicator' }).props.className).toBe(
      'absolute left-0 rounded-full bg-background',
    );
    expect(
      StyleSheet.flatten(
        renderer!.root.findByProps({ testID: 'account-tabs-indicator' }).props.style,
      ),
    ).toMatchObject({ width: 144 });
    const { withTiming } = jest.requireMock('react-native-reanimated') as {
      withTiming: jest.Mock;
    };
    expect(withTiming).toHaveBeenLastCalledWith(3, {
      duration: duration.base,
      easing: expect.anything(),
    });
  });
});

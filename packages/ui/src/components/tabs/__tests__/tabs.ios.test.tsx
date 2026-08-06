import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Tabs } from '../tabs.ios';
import type { TabsItemState } from '../tabs.types';

jest.mock('expo-glass-effect', () => ({
  GlassView: ({ children, ...props }: { children?: ReactNode }) => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');

    return React.createElement(View, { ...props, testID: 'glass-view' }, children);
  },
}));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withTiming: jest.fn((value: number) => value),
  };
});

const items = [
  { label: 'Messages', testID: 'messages-tab', value: 'messages' },
  { disabled: true, label: 'Settings', testID: 'settings-tab', value: 'settings' },
] as const;

describe('Tabs.ios', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  it('renders the Messages-style glass control at the supplied width', () => {
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

    if (!renderer) {
      throw new Error('Tabs test renderer was not created.');
    }

    const root = renderer.root.findByProps({ testID: 'account-tabs' });
    const glass = renderer.root.findByProps({ testID: 'glass-view' });
    const messages = renderer.root.findByProps({ testID: 'messages-tab' });
    const settings = renderer.root.findByProps({ testID: 'settings-tab' });

    expect(StyleSheet.flatten(root.props.style)).toMatchObject({ width: 144 });
    expect(glass.props).toMatchObject({ glassEffectStyle: 'regular', isInteractive: true });
    expect(glass.props.style).toMatchObject({ borderRadius: 17, height: 34, width: '100%' });
    expect(messages.props.accessibilityState).toEqual({ disabled: undefined, selected: true });
    expect(settings.props.accessibilityState).toEqual({ disabled: true, selected: false });
    expect(renderer.root.findAllByType(Text).map((label) => label.props.children)).toEqual([
      'Messages',
      'Settings',
    ]);

    act(() => messages.props.onPress());
    expect(onValueChange).toHaveBeenCalledWith('messages');
  });

  it('measures and animates a full-width control', () => {
    const { withTiming } = jest.requireMock('react-native-reanimated') as {
      withTiming: jest.Mock;
    };

    act(() => {
      renderer = create(
        <Tabs items={items} onValueChange={jest.fn()} testID="default-tabs" value="settings" />,
      );
    });

    if (!renderer) {
      throw new Error('Tabs test renderer was not created.');
    }

    const glass = renderer.root.findByProps({ testID: 'glass-view' });

    expect(glass.props.style).toMatchObject({ borderRadius: 17, height: 34, width: '100%' });

    act(() =>
      glass.props.onLayout({ nativeEvent: { layout: { height: 40, width: 300, x: 0, y: 0 } } }),
    );

    expect(withTiming).toHaveBeenLastCalledWith(153, { duration: 220 });
    expect(
      StyleSheet.flatten(
        renderer.root.findByProps({ testID: 'default-tabs-indicator' }).props.style,
      ),
    ).toMatchObject({ width: 144 });
  });

  it('renders custom children with the current item state', () => {
    const customItems = [
      {
        children: ({ isDisabled, isSelected }: TabsItemState) => (
          <Text testID="custom-tab-content">
            {isSelected ? 'selected' : 'idle'}-{isDisabled ? 'disabled' : 'enabled'}
          </Text>
        ),
        disabled: true,
        label: 'Text',
        testID: 'text-tab',
        value: 'text',
      },
    ] as const;

    act(() => {
      renderer = create(<Tabs items={customItems} onValueChange={jest.fn()} value="text" />);
    });

    if (!renderer) {
      throw new Error('Tabs test renderer was not created.');
    }

    expect(renderer.root.findByProps({ testID: 'text-tab' }).props.accessibilityLabel).toBe('Text');
    expect(renderer.root.findByProps({ testID: 'custom-tab-content' }).props.children).toEqual([
      'selected',
      '-',
      'disabled',
    ]);
  });
});

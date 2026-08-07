import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { MorphMenu } from '../morph-menu';

jest.mock('heroui-native/utils', () => {
  const { twMerge } = require('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('uniwind', () => ({
  useResolveClassNames: jest.fn(() => ({ backgroundColor: '#2c2c2e' })),
}));

jest.mock('heroui-native/portal', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    Portal: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, { ...props, mockComponent: 'hero-portal' }, children),
  };
});

// Harmless when Metro/jest resolves the Android surface instead: mocking a
// module nothing imports is a no-op.
jest.mock('expo-glass-effect', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    GlassView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, { ...props, testID: 'glass-view' }, children),
    isGlassEffectAPIAvailable: () => false,
    isLiquidGlassAvailable: () => false,
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View },
    Easing: { bezier: () => 'bezier' },
    interpolate: (value: number, _input: number[], output: number[]) =>
      output[0] + (output[1] - output[0]) * value,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => false,
    useSharedValue: (initial: number) => ({
      set(next: number) {
        this.value = next;
      },
      value: initial,
    }),
    // Land the animation immediately so the portal teardown a close schedules
    // runs within the same `act`.
    withTiming: (value: number, _config: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return value;
    },
  };
});

// `measureInWindow` is what turns the inline footprint into the floating copy's
// position; without it opening is a no-op. React Native's jest preset renders
// `View` as a class component, so the ref is an instance rather than a host
// node — `createNodeMock` never reaches it, and the measure methods have to be
// stubbed on the prototype instead.
const anchorRect = { height: 44, width: 44, x: 12, y: 700 };

(View as unknown as { prototype: Record<string, unknown> }).prototype.measureInWindow = (
  callback: (x: number, y: number, width: number, height: number) => void,
) => callback(anchorRect.x, anchorRect.y, anchorRect.width, anchorRect.height);

describe('MorphMenu', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  function render(onPress = jest.fn(), onOpenChange?: (isOpen: boolean) => void) {
    act(() => {
      renderer = create(
        <MorphMenu accessibilityLabel="Add" onOpenChange={onOpenChange} testID="menu">
          <MorphMenu.Item label="Camera" onPress={onPress} testID="menu-camera" />
        </MorphMenu>,
      );
    });

    return renderer!;
  }

  // A testID matches both the component that declares it and the `Pressable` it
  // renders; the innermost one carries the handler that actually runs on a tap.
  function findPressable(root: ReactTestInstance, testID: string) {
    const matches = root
      .findAllByProps({ testID })
      .filter((node) => typeof node.props.onPress === 'function');

    return matches[matches.length - 1]!;
  }

  function press(tree: ReactTestRenderer, testID: string) {
    act(() => {
      findPressable(tree.root, testID).props.onPress();
    });
  }

  function portal(tree: ReactTestRenderer) {
    return tree.root.findAllByProps({ mockComponent: 'hero-portal' })[0]!;
  }

  it('keeps the menu inline and reports itself collapsed while closed', () => {
    const tree = render();

    expect(tree.root.findAllByProps({ mockComponent: 'hero-portal' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'menu-trigger' }).props.accessibilityState).toEqual({
      expanded: false,
    });
  });

  it('floats the open menu in a portal anchored to the measured trigger', () => {
    const onOpenChange = jest.fn();
    const tree = render(jest.fn(), onOpenChange);

    press(tree, 'menu-trigger');

    expect(portal(tree).findAllByProps({ testID: 'menu-panel' }).length).toBeGreaterThan(0);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // The floating copy sits where the inline footprint was measured.
    const positioned = portal(tree).findAll((node) => {
      const style = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>);

      return style?.left === anchorRect.x && style?.top === anchorRect.y;
    });

    expect(positioned.length).toBeGreaterThan(0);
  });

  it('renders the dismiss catcher behind the menu', () => {
    const tree = render();

    press(tree, 'menu-trigger');

    // Paint order is document order, so a catcher rendered after the menu would
    // swallow every tap meant for an item.
    const order = portal(tree).findAll(() => true);
    const backdropIndex = order.findIndex((node) => node.props.testID === 'menu-backdrop');
    const menuIndex = order.findIndex((node) => node.props.testID === 'menu-panel');

    expect(backdropIndex).toBeGreaterThanOrEqual(0);
    expect(menuIndex).toBeGreaterThan(backdropIndex);
  });

  it('closes on the backdrop without choosing anything', () => {
    const onPress = jest.fn();
    const onOpenChange = jest.fn();
    const tree = render(onPress, onOpenChange);

    press(tree, 'menu-trigger');
    press(tree, 'menu-backdrop');

    expect(onPress).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(tree.root.findAllByProps({ mockComponent: 'hero-portal' })).toHaveLength(0);
  });

  it('closes itself before running an item, so callers do not have to', () => {
    const onPress = jest.fn();
    const onOpenChange = jest.fn();
    const tree = render(onPress, onOpenChange);

    press(tree, 'menu-trigger');
    press(tree, 'menu-camera');

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(tree.root.findAllByProps({ mockComponent: 'hero-portal' })).toHaveLength(0);
  });

  it('rejects an item rendered outside a menu', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      act(() => {
        create(<MorphMenu.Item label="Camera" onPress={jest.fn()} />);
      }),
    ).toThrow('Composer.Menu.Item must be rendered inside a Composer.Menu');

    consoleError.mockRestore();
  });

  it('renders an item icon alongside its label', () => {
    act(() => {
      renderer = create(
        <MorphMenu accessibilityLabel="Add" testID="menu">
          <MorphMenu.Item
            icon={<Text testID="icon">+</Text>}
            label="Camera"
            onPress={jest.fn()}
            testID="menu-camera"
          />
        </MorphMenu>,
      );
    });

    const item = findPressable(renderer!.root, 'menu-camera');

    expect(item.findAllByProps({ testID: 'icon' }).length).toBeGreaterThan(0);
    expect(item.props.accessibilityLabel).toBe('Camera');
  });
});

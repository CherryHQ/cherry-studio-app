import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { MorphMenu } from '../morph-menu';

jest.mock('heroui-native/utils', () => {
  const { twMerge } = require('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

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

type SharedValueStub = { set: (next: number) => void; value: number };
type TimingCallback = (finished: boolean) => void;
let mockReducedMotion = false;
let mockFinishTimingImmediately = true;
let mockTimingCallbacks: TimingCallback[] = [];

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View },
    Easing: { bezier: () => 'bezier' },
    interpolate: (value: number, _input: number[], output: number[]) =>
      output[0] + (output[1] - output[0]) * value,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => mockReducedMotion,
    // Backed by a ref, like the real one: a shared value that reset itself on
    // every render would make anything driven by one untestable.
    useSharedValue: (initial: number) => {
      const ref = React.useRef(null) as { current: SharedValueStub | null };

      ref.current ??= {
        set(next: number) {
          this.value = next;
        },
        value: initial,
      };

      return ref.current;
    },
    // Land the animation immediately so the portal teardown a close schedules
    // runs within the same `act`.
    withTiming: (value: number, _config: unknown, callback?: (finished: boolean) => void) => {
      if (callback) {
        if (mockFinishTimingImmediately) {
          callback(true);
        } else {
          mockTimingCallbacks.push(callback);
        }
      }
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
    mockReducedMotion = false;
    mockFinishTimingImmediately = true;
    mockTimingCallbacks = [];
    jest.clearAllMocks();
  });

  function render(onPress = jest.fn()) {
    act(() => {
      renderer = create(
        <MorphMenu accessibilityLabel="Add" testID="menu">
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

  function layout(tree: ReactTestRenderer, size: { height: number; width: number }) {
    const panel = tree.root.find(
      (node) => node.props.testID === 'menu-panel' && typeof node.props.onLayout === 'function',
    );

    act(() => {
      panel.props.onLayout({ nativeEvent: { layout: { ...size, x: 0, y: 0 } } });
    });
  }

  it('keeps the menu inline and reports itself collapsed while closed', () => {
    const tree = render();

    expect(tree.root.findAllByProps({ mockComponent: 'hero-portal' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'menu-trigger' }).props.accessibilityState).toEqual({
      expanded: false,
    });
  });

  it('floats the open menu in a portal anchored to the measured trigger', () => {
    const tree = render();

    press(tree, 'menu-trigger');

    expect(portal(tree).findAllByProps({ testID: 'menu-panel' }).length).toBeGreaterThan(0);
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
    const tree = render(onPress);

    press(tree, 'menu-trigger');
    press(tree, 'menu-backdrop');

    expect(onPress).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({ mockComponent: 'hero-portal' })).toHaveLength(0);
  });

  it('closes immediately when reduced motion is enabled', () => {
    mockReducedMotion = true;
    const tree = render();

    press(tree, 'menu-trigger');
    press(tree, 'menu-backdrop');

    expect(tree.root.findAllByProps({ mockComponent: 'hero-portal' })).toHaveLength(0);
  });

  it('closes itself before running an item, so callers do not have to', () => {
    const onPress = jest.fn();
    const tree = render(onPress);

    press(tree, 'menu-trigger');
    press(tree, 'menu-camera');

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByProps({ mockComponent: 'hero-portal' })).toHaveLength(0);
  });

  it('stops the closing portal from intercepting touches before its animation finishes', () => {
    mockFinishTimingImmediately = false;
    const tree = render();

    press(tree, 'menu-trigger');
    press(tree, 'menu-camera');

    expect(tree.root.findAllByProps({ mockComponent: 'hero-portal' }).length).toBeGreaterThan(0);
    expect(tree.root.findByProps({ testID: 'menu-backdrop' }).props.pointerEvents).toBe('none');
    expect(
      portal(tree).find((node) => {
        const style = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>);

        return (
          node.props.pointerEvents === 'none' &&
          style?.left === anchorRect.x &&
          style?.top === anchorRect.y
        );
      }),
    ).toBeDefined();

    act(() => {
      mockTimingCallbacks.splice(0).forEach((callback) => callback(true));
    });

    expect(tree.root.findAllByProps({ mockComponent: 'hero-portal' })).toHaveLength(0);
  });

  it('opens to the size its panel measured, on both axes', () => {
    const menu = () => (
      <MorphMenu accessibilityLabel="Add" testID="menu">
        <MorphMenu.Item label="Camera" onPress={jest.fn()} testID="menu-camera" />
      </MorphMenu>
    );

    act(() => {
      renderer = create(menu());
    });

    const tree = renderer!;

    // The panel lays out inline, before anything opens — which is why the closed
    // state can be a clip window over a full-size panel rather than a smaller
    // version of it.
    layout(tree, { height: 420, width: 340 });
    press(tree, 'menu-trigger');
    // Opening moves a shared value, which does not re-render on its own; a
    // commit is what recomputes the style this reads. It has to be a fresh
    // element — React bails out on one it is already rendering.
    act(() => tree.update(menu()));

    const container = portal(tree).find((node) => {
      const style = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>);

      return style?.height === 420;
    });

    expect(StyleSheet.flatten(container.props.style as StyleProp<ViewStyle>).width).toBe(340);
  });

  it('rejects an item rendered outside a menu', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      act(() => {
        create(<MorphMenu.Item label="Camera" onPress={jest.fn()} />);
      }),
    ).toThrow('useComposerMenu must be called inside a Composer.Menu');

    consoleError.mockRestore();
  });

  // A switch row is still one decision, so it leaves the same way an item does.
  it('closes itself before flipping a toggle', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <MorphMenu accessibilityLabel="Add" testID="menu">
          <MorphMenu.Toggle
            label="Web search"
            onValueChange={onValueChange}
            testID="menu-web-search"
            value={false}
          />
        </MorphMenu>,
      );
    });

    const tree = renderer!;

    press(tree, 'menu-trigger');
    press(tree, 'menu-web-search');

    expect(onValueChange).toHaveBeenCalledWith(true);
    expect(tree.root.findAllByProps({ mockComponent: 'hero-portal' })).toHaveLength(0);
  });

  it('reports the toggle state to assistive tech', () => {
    act(() => {
      renderer = create(
        <MorphMenu accessibilityLabel="Add" testID="menu">
          <MorphMenu.Toggle
            label="Web search"
            onValueChange={jest.fn()}
            testID="menu-web-search"
            value
          />
        </MorphMenu>,
      );
    });

    const toggle = findPressable(renderer!.root, 'menu-web-search');

    expect(toggle.props.accessibilityRole).toBe('switch');
    expect(toggle.props.accessibilityState).toEqual({ checked: true, disabled: undefined });
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

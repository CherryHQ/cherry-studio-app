import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { MorphMenu } from '../morph-menu';

jest.mock('heroui-native/utils', () => {
  const { twMerge } = jest.requireActual('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('../../../../menu/menu-overlay', () => {
  const React = jest.requireActual('react');
  const { Pressable, View } = jest.requireActual('react-native');
  const { MenuInteraction } = jest.requireActual('../../../../menu/menu-interaction');

  return {
    KeyboardMenuOverlay: ({
      children,
      isOpen,
      isVisible,
      onClose,
      onClosed,
      testID,
    }: {
      children: React.ReactNode;
      isOpen: boolean;
      isVisible: boolean;
      onClose: () => void;
      onClosed: () => void;
      testID?: string;
    }) => {
      React.useEffect(() => {
        if (!isVisible) onClosed();
      }, [isVisible, onClosed]);
      if (!isVisible) return null;
      return React.createElement(
        MenuInteraction,
        { value: { isOpen, close: onClose } },
        React.createElement(
          View,
          { mockComponent: 'menu-overlay' },
          React.createElement(Pressable, {
            onPress: onClose,
            pointerEvents: isOpen ? 'auto' : 'none',
            testID: `${testID}-backdrop`,
          }),
          React.createElement(View, { pointerEvents: isOpen ? 'box-none' : 'none' }, children),
        ),
      );
    },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// Harmless when Metro/jest resolves the Android surface instead: mocking a
// module nothing imports is a no-op.
jest.mock('expo-glass-effect', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    GlassView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, { ...props, testID: 'glass-view' }, children),
    isGlassEffectAPIAvailable: () => false,
    isLiquidGlassAvailable: () => false,
  };
});

type SharedValueStub<TValue> = {
  get: () => TValue;
  set: (next: TValue) => void;
  value: TValue;
};
type TimingCallback = (finished: boolean) => void;
let mockReducedMotion = false;
let mockFinishTimingImmediately = true;
let mockTimingCallbacks: TimingCallback[] = [];
let mockFrameCallback: () => void;
let mockFrameActive = false;
const mockMeasure = jest.fn();

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View },
    cancelAnimation: jest.fn(),
    Easing: { bezier: () => 'bezier' },
    interpolate: (value: number, _input: number[], output: number[]) =>
      output[0] + (output[1] - output[0]) * value,
    measure: (...args: unknown[]) => mockMeasure(...args),
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedRef: () => React.useRef(null),
    useAnimatedStyle: (factory: () => object) => factory(),
    useDerivedValue: (factory: () => unknown) => ({ get: factory }),
    useFrameCallback: (callback: () => void) => {
      mockFrameCallback = callback;
      const ref = React.useRef(null);
      ref.current ??= {
        setActive: (active: boolean) => {
          mockFrameActive = active;
        },
      };
      return ref.current;
    },
    useReducedMotion: () => mockReducedMotion,
    // Backed by a ref, like the real one: a shared value that reset itself on
    // every render would make anything driven by one untestable.
    useSharedValue: <TValue,>(initial: TValue) => {
      const ref = React.useRef(null) as { current: SharedValueStub<TValue> | null };

      ref.current ??= {
        get() {
          return this.value;
        },
        set(next: TValue) {
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
    mockMeasure.mockReset();
    jest.restoreAllMocks();
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
    return tree.root.findAllByProps({ mockComponent: 'menu-overlay' })[0]!;
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

    expect(tree.root.findAllByProps({ mockComponent: 'menu-overlay' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'menu-trigger' }).props.accessibilityState).toEqual({
      expanded: false,
    });
  });

  it('floats the open menu in the shared overlay anchored to the measured trigger', () => {
    const tree = render();

    press(tree, 'menu-trigger');

    expect(portal(tree).findAllByProps({ testID: 'menu-panel' }).length).toBeGreaterThan(0);
    // The floating copy sits where the inline footprint was measured.
    const floating = portal(tree).findByProps({ role: 'menu' });
    expect(StyleSheet.flatten(floating.props.style).transform).toEqual([
      { translateX: anchorRect.x },
      { translateY: anchorRect.y },
    ]);
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

  it('follows a moving trigger and bounds the panel until the closing animation finishes', () => {
    mockFinishTimingImmediately = false;
    const menu = () => (
      <MorphMenu accessibilityLabel="Add" testID="menu">
        <MorphMenu.Item label="Camera" onPress={jest.fn()} testID="menu-camera" />
      </MorphMenu>
    );
    act(() => {
      renderer = create(menu());
    });
    const tree = renderer!;
    expect(mockFrameActive).toBe(false);
    layout(tree, { height: 420, width: 340 });
    press(tree, 'menu-trigger');
    expect(mockFrameActive).toBe(true);

    function moveTrigger(pageX: number, pageY: number) {
      mockMeasure.mockReturnValue({ pageX, pageY, width: 32, height: 32 });
      act(() => {
        mockFrameCallback();
        tree.update(menu());
      });
      const floating = portal(tree).findByProps({ role: 'menu' });
      expect(StyleSheet.flatten(floating.props.style).transform).toEqual([
        { translateX: pageX },
        { translateY: pageY },
      ]);
    }

    moveTrigger(18, 240);
    const panel = portal(tree).find(
      (node) => node.props.testID === 'menu-panel' && node.props.style !== undefined,
    );
    expect(StyleSheet.flatten(panel.props.style).maxHeight).toBe(256);
    expect(
      portal(tree).findAll((node) => StyleSheet.flatten(node.props.style)?.height === 256).length,
    ).toBeGreaterThan(0);

    // An unavailable measurement must retain the last usable position.
    mockMeasure.mockReturnValue(null);
    act(() => {
      mockFrameCallback();
      tree.update(menu());
    });
    expect(
      StyleSheet.flatten(portal(tree).findByProps({ role: 'menu' }).props.style).transform,
    ).toEqual([{ translateX: 18 }, { translateY: 240 }]);

    press(tree, 'menu-backdrop');
    expect(mockFrameActive).toBe(true);
    moveTrigger(18, 480);
    act(() => mockTimingCallbacks.splice(0).forEach((callback) => callback(true)));
    expect(mockFrameActive).toBe(false);
    expect(tree.root.findAllByProps({ mockComponent: 'menu-overlay' })).toHaveLength(0);
  });

  it('ignores an older opening measurement delivered after the latest press', () => {
    const pending: ((x: number, y: number, width: number, height: number) => void)[] = [];
    jest.spyOn(View.prototype, 'measureInWindow').mockImplementation((callback) => {
      pending.push(callback);
    });
    const tree = render();
    press(tree, 'menu-trigger');
    press(tree, 'menu-trigger');
    act(() => pending[1](18, 300, 32, 32));
    act(() => pending[0](12, 700, 32, 32));

    expect(
      StyleSheet.flatten(portal(tree).findByProps({ role: 'menu' }).props.style).transform,
    ).toEqual([{ translateX: 18 }, { translateY: 300 }]);
  });

  it('closes on the backdrop without choosing anything', () => {
    const onPress = jest.fn();
    const tree = render(onPress);

    press(tree, 'menu-trigger');
    press(tree, 'menu-backdrop');

    expect(onPress).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({ mockComponent: 'menu-overlay' })).toHaveLength(0);
  });

  it('closes immediately when reduced motion is enabled', () => {
    mockReducedMotion = true;
    const tree = render();

    press(tree, 'menu-trigger');
    press(tree, 'menu-backdrop');

    expect(tree.root.findAllByProps({ mockComponent: 'menu-overlay' })).toHaveLength(0);
  });

  it('closes itself before running an item, so callers do not have to', () => {
    const onPress = jest.fn();
    const tree = render(onPress);

    press(tree, 'menu-trigger');
    press(tree, 'menu-camera');

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByProps({ mockComponent: 'menu-overlay' })).toHaveLength(0);
  });

  it('disables the closing menu content before its animation finishes', () => {
    mockFinishTimingImmediately = false;
    const tree = render();

    press(tree, 'menu-trigger');
    press(tree, 'menu-camera');

    expect(tree.root.findAllByProps({ mockComponent: 'menu-overlay' }).length).toBeGreaterThan(0);
    expect(tree.root.findByProps({ testID: 'menu-backdrop' }).props.pointerEvents).toBe('none');
    expect(
      portal(tree).findAll(
        (node) =>
          node.props.pointerEvents === 'none' &&
          node.findAllByProps({ testID: 'menu-panel' }).length > 0,
      ).length,
    ).toBeGreaterThan(0);

    act(() => {
      mockTimingCallbacks.splice(0).forEach((callback) => callback(true));
    });

    expect(tree.root.findAllByProps({ mockComponent: 'menu-overlay' })).toHaveLength(0);
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
    ).toThrow('Menu items must be rendered inside a menu');

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
    expect(tree.root.findAllByProps({ mockComponent: 'menu-overlay' })).toHaveLength(0);
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
    expect(toggle.props.accessibilityState).toEqual({ checked: true, disabled: false });
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

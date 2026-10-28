import { Profiler, useEffect } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ComposerDock } from '../components/composer-dock';
import type { useComposerExpansion } from '../components/composer-expansion';
import { useComposerDockLayout } from '../hooks/use-composer-dock-layout';

let mockBottomInset = 34;
let mockExpansion: ReturnType<typeof useComposerExpansion> = null;

jest.mock('../components/composer-expansion', () => ({
  useComposerExpansion: () => mockExpansion,
}));

jest.mock('uniwind', () => ({
  withUniwind: (component: unknown) => component,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: mockBottomInset, left: 0, right: 0, top: 0 }),
}));

// An open keyboard 300pt tall.
jest.mock('react-native-keyboard-controller', () => ({
  useReanimatedKeyboardAnimation: () => ({
    height: { get: () => -300 },
    progress: { get: () => 1 },
  }),
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  Easing: { bezier: () => 'settle' },
  useAnimatedReaction: <T,>(prepare: () => T, react: (value: T, previous: T | null) => void) =>
    react(prepare(), null),
  useAnimatedStyle: (factory: () => object) => factory(),
  useSharedValue: (initialValue: number) => {
    const { useRef } = jest.requireActual('react');
    return useRef({
      set(nextValue: number) {
        this.value = nextValue;
      },
      value: initialValue,
    }).current;
  },
}));

jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn() }));

type DockLayout = ReturnType<typeof useComposerDockLayout>;

const cell = <T,>(value: T) =>
  ({
    value,
    get() {
      return this.value;
    },
    set(next: T) {
      this.value = next;
    },
  }) as SharedValue<T>;

let dockLayout: DockLayout | undefined;

function DockLayoutProbe() {
  const currentLayout = useComposerDockLayout();

  useEffect(() => {
    dockLayout = currentLayout;
  }, [currentLayout]);

  return null;
}

describe('Composer.Dock', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockBottomInset = 34;
    mockExpansion = null;
    dockLayout = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('applies safe-area geometry, keyboard offset, and measured height', () => {
    const onHeightChange = jest.fn();
    const onLayout = jest.fn();

    act(() => {
      renderer = create(
        <ComposerDock onHeightChange={onHeightChange} onLayout={onLayout}>
          <View testID="content" />
        </ComposerDock>,
      );
    });

    const container = renderer!.root.findByProps({ pointerEvents: 'box-none' });
    const layoutEvent = { nativeEvent: { layout: { height: 126 } } };

    // A stationary native wrapper would clip the lifted input under Android's blur target.
    // The open keyboard lifts the dock by its height less the safe area it already covers.
    expect(container.props.style).toEqual([
      { paddingBottom: 38, paddingHorizontal: 16 },
      { transform: [{ translateY: -274 }] },
    ]);

    act(() => container.props.onLayout(layoutEvent));

    expect(onHeightChange).toHaveBeenCalledWith(126);
    expect(onLayout).toHaveBeenCalledWith(layoutEvent);
  });

  it('reserves the minimum dock height and tracks live height updates', () => {
    act(() => {
      renderer = create(<DockLayoutProbe />);
    });

    expect(dockLayout).toMatchObject({
      contentBottomInset: 134,
      inputHeight: 126,
      keyboardOffset: 26,
    });
    expect(dockLayout?.inputHeightShared.value).toBe(126);

    act(() => dockLayout?.handleInputHeightChange(140.2));

    expect(dockLayout).toMatchObject({ contentBottomInset: 149, inputHeight: 141 });
    expect(dockLayout?.inputHeightShared.value).toBe(140.2);

    act(() => dockLayout?.handleInputHeightChange(20));

    expect(dockLayout).toMatchObject({ contentBottomInset: 134, inputHeight: 126 });
    expect(dockLayout?.inputHeightShared.value).toBe(20);
  });

  it('uses minimum padding when the device has no bottom inset', () => {
    mockBottomInset = 0;

    act(() => {
      renderer = create(
        <ComposerDock onHeightChange={jest.fn()}>
          <View />
        </ComposerDock>,
      );
    });

    expect(renderer!.root.findByProps({ pointerEvents: 'box-none' }).props.style).toEqual([
      { paddingBottom: 12, paddingHorizontal: 16 },
      { transform: [{ translateY: -300 }] },
    ]);
  });

  it('follows the keyboard only while its tracking cell is on', () => {
    const keyboardTracking = cell(false);
    const renderDock = () => (
      <ComposerDock keyboardTracking={keyboardTracking}>
        <View />
      </ComposerDock>
    );
    const translateY = () =>
      renderer!.root.findByProps({ pointerEvents: 'box-none' }).props.style[1].transform[0]
        .translateY;

    act(() => {
      renderer = create(renderDock());
    });
    expect(translateY()).toBe(0);

    keyboardTracking.set(true);
    // This mock evaluates animated styles on render; on device the UI thread reads the cell.
    act(() => renderer!.update(renderDock()));
    expect(translateY()).toBe(-274);
  });

  it('can participate in parent flow without measuring its animated height', () => {
    act(() => {
      renderer = create(
        <ComposerDock layoutMode="flow">
          <View />
        </ComposerDock>,
      );
    });

    const container = renderer!.root.findByProps({ pointerEvents: 'box-none' });
    expect(container.props.className).toBe('z-10 shrink-0');
    expect(container.props.onLayout).toBeUndefined();
  });

  it('publishes overlay space without rerendering and keeps it while the resting background fades', () => {
    const contentInset = cell(0);
    const progress = cell(0);
    mockExpansion = {
      state: { isExpanded: false, isPresented: false },
      actions: { expand: jest.fn(), collapse: jest.fn(), resizeContent: jest.fn() },
      meta: {
        compactDockHeight: cell(0),
        contentInset,
        extraHeight: cell(0),
        keyboardTrackingEnabled: cell(false),
        progress,
      },
    };
    const onRender = jest.fn();
    const onHeightChange = jest.fn();
    const renderDock = () => (
      <Profiler id="dock" onRender={onRender}>
        <ComposerDock
          backgroundClassName="bg-chat-background"
          layoutMode="expandable-overlay"
          onHeightChange={onHeightChange}
        >
          <View testID="editor" />
        </ComposerDock>
      </Profiler>
    );
    act(() => {
      renderer = create(renderDock());
    });
    // A dock without a tracking cell always follows, and the expansion rides the same keyboard.
    expect(mockExpansion.meta.keyboardTrackingEnabled.get()).toBe(true);
    onRender.mockClear();
    for (const height of [100, 110, 125, 148]) {
      act(() =>
        renderer!.root.findAllByProps({ pointerEvents: 'box-none' })[0].props.onLayout({
          nativeEvent: { layout: { height } },
        }),
      );
    }
    expect(contentInset.get()).toBe(148);
    expect(onRender).not.toHaveBeenCalled();
    const restingBackground = () =>
      renderer!.root.findByProps({ className: 'absolute inset-0 bg-chat-background' });
    // The compact dock hides the transcript it overlays.
    expect(restingBackground().props.style).toEqual({ opacity: 1 });

    mockExpansion.state = { isExpanded: true, isPresented: true };
    progress.set(1);
    act(() => renderer!.update(renderDock()));
    expect(restingBackground().props.style).toEqual({ opacity: 0 });
    act(() =>
      renderer!.root.findAllByProps({ pointerEvents: 'box-none' })[0].props.onLayout({
        nativeEvent: { layout: { height: 600 } },
      }),
    );
    expect(contentInset.get()).toBe(148);
    expect(onHeightChange).toHaveBeenLastCalledWith(600);

    act(() => renderer!.unmount());
    renderer = undefined;
    expect(contentInset.get()).toBe(0);
  });
});

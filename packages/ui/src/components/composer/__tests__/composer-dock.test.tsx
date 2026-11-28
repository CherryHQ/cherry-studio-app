import { Profiler, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ComposerDock } from '../components/composer-dock';
import type { useComposerExpansion } from '../components/composer-expansion';
import { useComposerDockLayout } from '../hooks/use-composer-dock-layout';

let mockBottomInset = 34;
let mockKeyboardMaxHeight = 300;
let mockKeyboardProgress = 1;
const mockReactions: (() => void)[] = [];
let mockExpansion: ReturnType<typeof useComposerExpansion> = null;

jest.mock('../components/composer-expansion', () => ({
  useComposerExpansion: () => mockExpansion,
}));

jest.mock('expo-linear-gradient', () => {
  const { createElement } = jest.requireActual('react');
  return {
    LinearGradient: (props: object) => createElement('LinearGradient', props),
  };
});

const createDefaultResolvedClasses = (): Record<string, { backgroundColor?: string }> => ({
  'bg-background': { backgroundColor: '#f5f5f5' },
  'bg-background/0': { backgroundColor: 'rgba(245, 245, 245, 0)' },
  'bg-chat-background': { backgroundColor: '#f9f9f9' },
  'bg-chat-background/0': { backgroundColor: 'rgba(249, 249, 249, 0)' },
});
let mockResolvedClasses = createDefaultResolvedClasses();

jest.mock('uniwind', () => ({
  useResolveClassNames: (className: string) => mockResolvedClasses[className] ?? {},
  withUniwind: (component: unknown) => component,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: mockBottomInset, left: 0, right: 0, top: 0 }),
}));

// An open keyboard whose height can vary by test case.
jest.mock('react-native-keyboard-controller', () => ({
  useReanimatedKeyboardAnimation: () => ({
    height: { get: () => -mockKeyboardMaxHeight * mockKeyboardProgress },
    progress: { get: () => mockKeyboardProgress },
  }),
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  Easing: { bezier: () => 'settle' },
  useAnimatedReaction: <T,>(prepare: () => T, react: (value: T, previous: T | null) => void) => {
    const { useRef } = jest.requireActual<typeof import('react')>('react');
    const index = useRef<number | undefined>(undefined);
    index.current ??= mockReactions.length;
    const evaluate = () => react(prepare(), null);
    mockReactions[index.current] = evaluate;
    evaluate();
  },
  useDerivedValue: (factory: () => unknown) => ({ get: factory }),
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
    mockReactions.length = 0;
    mockBottomInset = 34;
    mockKeyboardMaxHeight = 300;
    mockKeyboardProgress = 1;
    mockExpansion = null;
    mockResolvedClasses = createDefaultResolvedClasses();
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

  it('keeps the navigation clearance while another input owns an open keyboard', () => {
    act(() => {
      renderer = create(<ComposerDock keyboardTracking={cell(false)} extraBottomOffset={42} />);
    });
    const dock = renderer!.root.findByProps({ pointerEvents: 'box-none' });
    expect(StyleSheet.flatten(dock.props.style)).toMatchObject({
      paddingBottom: 80,
      transform: [{ translateY: 0 }],
    });
  });

  it('reserves the minimum dock height and tracks live height updates', () => {
    act(() => {
      renderer = create(<DockLayoutProbe />);
    });

    expect(dockLayout).toMatchObject({
      contentBottomInset: 150,
      inputHeight: 126,
      keyboardOffset: 26,
    });
    expect(dockLayout?.inputHeightShared.value).toBe(126);

    act(() => dockLayout?.handleInputHeightChange(140.2));

    expect(dockLayout).toMatchObject({ contentBottomInset: 165, inputHeight: 141 });
    expect(dockLayout?.inputHeightShared.value).toBe(140.2);

    act(() => dockLayout?.handleInputHeightChange(20));

    expect(dockLayout).toMatchObject({ contentBottomInset: 150, inputHeight: 126 });
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
        dockLift: cell(0),
        editorMorphing: cell(false),
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
    act(() => mockReactions.forEach((reaction) => reaction()));
    expect(contentInset.get()).toBe(148);
    expect(onRender).not.toHaveBeenCalled();
    const restingBackground = () => renderer!.root.findByProps({ testID: 'composer-dock-fade' });
    const restingFloor = () => renderer!.root.findByProps({ testID: 'composer-dock-floor' });
    // The compact dock anchors a solid floor below the composer with a short soft fade at its bottom edge.
    expect(StyleSheet.flatten(restingBackground().props.style)).toEqual({
      bottom: 0,
      left: 0,
      opacity: 1,
      position: 'absolute',
      right: 0,
    });
    expect(StyleSheet.flatten(restingBackground().props.style)).not.toHaveProperty('top');
    expect(restingFloor().props.className).toBe('bg-chat-background');
    expect(StyleSheet.flatten(restingFloor().props.style)).toEqual({ height: 38 });
    const gradient = restingBackground().findByType('LinearGradient' as never);
    expect(gradient.props).toMatchObject({
      colors: ['rgba(249, 249, 249, 0)', '#f9f9f9', '#f9f9f9'],
      locations: [0, 20 / 21, 1],
      style: { height: 21, marginBottom: -1 },
    });

    mockExpansion.state = { isExpanded: true, isPresented: true };
    progress.set(1);
    act(() => renderer!.update(renderDock()));
    expect(StyleSheet.flatten(restingBackground().props.style)).toMatchObject({ opacity: 0 });
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

  it('keeps the solid floor aligned to bottom padding across extraBottomOffset, expansion, and unresolved gradient fallback', () => {
    const progress = cell(0);
    mockExpansion = {
      actions: { collapse: jest.fn(), expand: jest.fn(), resizeContent: jest.fn() },
      meta: {
        compactDockHeight: cell(0),
        contentInset: cell(0),
        dockLift: cell(0),
        editorMorphing: cell(false),
        extraHeight: cell(0),
        keyboardTrackingEnabled: cell(true),
        progress,
      },
      state: { isExpanded: false, isPresented: false },
    };

    const renderDock = () => (
      <ComposerDock
        backgroundClassName="bg-chat-background"
        extraBottomOffset={64}
        layoutMode="expandable-overlay"
      >
        <View testID="editor" />
      </ComposerDock>
    );

    act(() => {
      renderer = create(renderDock());
    });

    const restingBackground = () => renderer!.root.findByProps({ testID: 'composer-dock-fade' });
    const restingFloor = () => renderer!.root.findByProps({ testID: 'composer-dock-floor' });

    expect(StyleSheet.flatten(restingFloor().props.style)).toEqual({ height: 102 });
    expect(restingBackground().findAllByType('LinearGradient' as never)).toHaveLength(1);

    progress.set(1);
    act(() => renderer!.update(renderDock()));
    expect(StyleSheet.flatten(restingFloor().props.style)).toEqual({ height: 38 });

    progress.set(0);
    mockResolvedClasses = {};
    act(() => renderer!.update(renderDock()));
    expect(restingBackground().findAllByType('LinearGradient' as never)).toHaveLength(0);
    expect(StyleSheet.flatten(restingBackground().props.style)).not.toHaveProperty('top');
    expect(restingFloor().props.className).toBe('bg-chat-background');
    expect(StyleSheet.flatten(restingFloor().props.style)).toEqual({ height: 102 });
  });

  it('keeps list insets steady while the dock moves and the editor morphs', () => {
    const compactDockHeight = cell(0);
    const contentInset = cell(0);
    const dockLift = cell(0);
    const editorMorphing = cell(false);
    const progress = cell(0);
    mockExpansion = {
      actions: { collapse: jest.fn(), expand: jest.fn(), resizeContent: jest.fn() },
      meta: {
        compactDockHeight,
        contentInset,
        dockLift,
        editorMorphing,
        extraHeight: cell(0),
        keyboardTrackingEnabled: cell(true),
        progress,
      },
      state: { isExpanded: false, isPresented: false },
    };
    mockKeyboardMaxHeight = 300;
    mockKeyboardProgress = 0;

    const innerDockStyle = () =>
      StyleSheet.flatten(
        renderer!.root
          .findAllByProps({ pointerEvents: 'box-none' })
          .find((node) =>
            node.children.some((c) => typeof c !== 'string' && c?.props?.testID === 'dock-child'),
          )?.props.style,
      );
    const outerStickyStyle = () =>
      StyleSheet.flatten(
        renderer!.root
          .findAllByProps({ pointerEvents: 'box-none' })
          .find((node) => typeof node.props.onLayout === 'function')?.props.style,
      );

    const renderExtraDock = () => (
      <ComposerDock extraBottomOffset={64} keyboardTracking={cell(true)} layoutMode="expandable">
        <View testID="dock-child" />
      </ComposerDock>
    );

    act(() => {
      renderer = create(renderExtraDock());
    });
    const restingPaddingBottom = innerDockStyle().paddingBottom as number;
    expect(restingPaddingBottom).toBeGreaterThanOrEqual(64);
    expect(outerStickyStyle().transform).toEqual([{ translateY: 0 }]);

    const layoutDock = (height: number) =>
      act(() => {
        renderer!.root
          .findAllByProps({ pointerEvents: 'box-none' })
          .find((node) => typeof node.props.onLayout === 'function')
          ?.props.onLayout({ nativeEvent: { layout: { height } } });
        mockReactions.forEach((reaction) => reaction());
      });
    layoutDock(148);
    expect(contentInset.get()).toBe(148);

    mockKeyboardProgress = 1;
    act(() => renderer!.update(renderExtraDock()));
    expect(innerDockStyle().paddingBottom).toBe(restingPaddingBottom);
    expect(outerStickyStyle().transform).toEqual([{ translateY: -300 + 26 + 64 }]);
    expect(dockLift.get()).toBe(210);
    expect(contentInset.get()).toBe(148);

    editorMorphing.set(true);
    for (const height of [150, 165, 190]) {
      layoutDock(height);
      expect(compactDockHeight.get()).toBe(height);
      expect(contentInset.get()).toBe(148);
    }
    editorMorphing.set(false);
    layoutDock(192);
    expect(contentInset.get()).toBe(192);
    // Typing or adding an attachment after the morph grows the list range immediately.
    layoutDock(222);
    expect(contentInset.get()).toBe(222);
    expect(dockLift.get()).toBe(210);

    // Small hardware-keyboard accessory bar clamps collapse so composer never dips below bottom dock.
    mockKeyboardMaxHeight = 55;
    act(() => renderer!.update(renderExtraDock()));
    expect(outerStickyStyle().transform).toEqual([{ translateY: 0 }]);
    expect(dockLift.get()).toBe(0);
    expect(contentInset.get()).toBe(222);

    // Full-screen expansion reclaims extraBottomOffset from paddingBottom.
    mockKeyboardMaxHeight = 300;
    progress.set(1);
    act(() => renderer!.update(renderExtraDock()));
    expect(innerDockStyle().paddingBottom).toBeLessThan(64);
  });
});

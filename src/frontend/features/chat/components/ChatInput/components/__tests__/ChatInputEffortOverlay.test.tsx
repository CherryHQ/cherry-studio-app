import { easing } from '@cherrystudio/ui/motion';
import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Extrapolation, interpolate } from 'react-native-reanimated';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { EffortSliderTrack } from '../../effortSlider/components/EffortSliderTrack';
import type { ChatInputReasoningEffort } from '../../utils/chatInputReasoning';
import { ChatInputEffortBackdrop } from '../ChatInputEffortBackdrop/ChatInputEffortBackdrop';
import { ChatInputEffortOverlay } from '../ChatInputEffortOverlay';

type TestProgress = { value: number; get: () => number; set: (value: number) => void };
type TestAnimation = {
  startedAt: number;
  from: number;
  to: number;
  delay: number;
  duration: number;
  easing: (progress: number) => number;
  done?: (finished: boolean) => void;
};

let mockProgress: TestProgress;
let mockAnimation: TestAnimation | undefined;
let mockReducedMotion = false;
let mockKeyboardVisible = false;
let mockTime = 0;
const mockAnimatedStyles = new WeakMap<object, () => ViewStyle>();

jest.mock('react-native', () => {
  const { createElement, forwardRef } = jest.requireActual<typeof import('react')>('react');
  const actual = jest.requireActual<typeof import('react-native')>('react-native');
  const View = forwardRef<unknown, Record<string, unknown>>((props, ref) =>
    createElement('View', { ...props, ref }),
  );
  return Object.defineProperties(Object.create(actual), {
    View: { value: View },
    useWindowDimensions: {
      value: () => ({ fontScale: 1, height: 1180, scale: 2, width: 820 }),
    },
  });
});

jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const interpolation = jest.requireActual('react-native-reanimated/src/interpolation');
  const { Easing } = jest.requireActual('react-native-reanimated/src/Easing');
  return {
    __esModule: true,
    default: { View },
    ...interpolation,
    Easing,
    runOnJS: (callback: unknown) => callback,
    runOnUI: (callback: unknown) => callback,
    useReducedMotion: () => mockReducedMotion,
    useSharedValue: (initial: unknown) => {
      const ref = useRef({
        value: initial,
        get: () => ref.current.value,
        set: (value: unknown) => {
          ref.current.value = value;
        },
      });
      return ref.current;
    },
    // Keep callbacks attached to the rendered style objects so assertions evaluate the
    // component's current styles, without depending on Hook order or a React rerender.
    useAnimatedStyle: (updater: () => ViewStyle) => {
      const style = {};
      mockAnimatedStyles.set(style, updater);
      return style;
    },
    withTiming: (
      to: number,
      config: {
        duration: number;
        easing: TestAnimation['easing'] | { factory: () => TestAnimation['easing'] };
      },
      done?: (finished: boolean) => void,
    ) => {
      mockAnimation = {
        ...config,
        delay: 0,
        done,
        easing: typeof config.easing === 'function' ? config.easing : config.easing.factory(),
        from: mockProgress.value,
        startedAt: mockTime,
        to,
      };
      return mockProgress.value;
    },
    withDelay: (delay: number, value: number) => {
      mockAnimation!.delay = delay;
      return value;
    },
  };
});

jest.mock('@cherrystudio/ui/components', () => ({
  Portal: ({ children }: { children: ReactNode }) => children,
  TextAnimation: { Rotating: () => null },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: (tokens: string | string[]) =>
    Array.isArray(tokens) ? ['#00aa00', '#ffffff', '#111111', '#eeeeee', '#000000'] : '#000000',
}));
jest.mock('react-native-keyboard-controller', () => ({
  useKeyboardState: () => ({
    appearance: 'light',
    height: mockKeyboardVisible ? 300 : 0,
    isVisible: mockKeyboardVisible,
  }),
  OverKeyboardView: ({ children, visible }: { children: ReactNode; visible: boolean }) =>
    visible ? children : null,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: ReactNode }) => children,
  GestureHandlerRootView: (props: object) => {
    const { createElement } = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    return createElement(View, props);
  },
}));
jest.mock('../ChatInputEffortBackdrop/ChatInputEffortBackdrop', () => ({
  ChatInputEffortBackdrop: () => null,
}));
// Keep the real slider and track; only replace the native gesture driver.
jest.mock('../../effortSlider/hooks/useEffortSliderGesture', () => ({
  useEffortSliderGesture: ({
    initialIndex,
    stopCount,
  }: {
    initialIndex: number;
    stopCount: number;
  }) => {
    const { useSharedValue } =
      jest.requireMock<typeof import('react-native-reanimated')>('react-native-reanimated');
    return {
      gesture: {},
      position: useSharedValue(stopCount < 2 ? 0 : initialIndex / (stopCount - 1)),
      activeStopIndex: useSharedValue(initialIndex),
      isPressed: useSharedValue(false),
      trackWidth: useSharedValue(0),
    };
  },
}));
jest.mock('../ChatInputEffortGauge', () => ({
  ChatInputEffortGauge: ({ onPress }: { onPress: (frame: object) => void }) => {
    const { createElement } = jest.requireActual<typeof import('react')>('react');
    const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
    return createElement(Pressable, {
      onPress: () => onPress({ height: 32, left: 728, top: 1096, width: 32 }),
      testID: 'chat-input-effort-gauge',
    });
  },
}));

describe('ChatInputEffortOverlay motion', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    mockAnimation = undefined;
    mockReducedMotion = false;
    mockKeyboardVisible = false;
    mockTime = 0;
  });
  afterEach(() => act(() => renderer?.unmount()));

  function node(testID: string) {
    return renderer.root.find(
      (entry) => typeof entry.type === 'string' && entry.props.testID === testID,
    );
  }

  function style(entry: ReactTestInstance): ViewStyle {
    const resolve = (value: StyleProp<ViewStyle>): StyleProp<ViewStyle> => {
      if (Array.isArray(value)) return value.map(resolve);
      if (value && typeof value === 'object') return mockAnimatedStyles.get(value)?.() ?? value;
      return value;
    };
    return StyleSheet.flatten(resolve(entry.props.style)) ?? {};
  }

  // Include only native ancestors: composite View wrappers repeat their host's props.
  function effectiveOpacity(entry: ReactTestInstance): number {
    const own = typeof entry.type === 'string' ? (style(entry).opacity ?? 1) : 1;
    return own * (entry.parent ? effectiveOpacity(entry.parent) : 1);
  }

  function seek(milliseconds: number) {
    advanceTo(mockAnimation!.startedAt + milliseconds);
  }

  function advanceTo(milliseconds: number) {
    mockTime = milliseconds;
    const animation = mockAnimation!;
    const fraction = Math.max(
      0,
      Math.min(1, (milliseconds - animation.startedAt - animation.delay) / animation.duration),
    );
    mockProgress.value =
      animation.from + (animation.to - animation.from) * animation.easing(fraction);
    if (fraction === 1) act(() => animation.done?.(true));
  }

  function open() {
    act(() => renderer.root.findByProps({ testID: 'chat-input-effort-gauge' }).props.onPress());
    const backdrop = renderer.root.findByType(ChatInputEffortBackdrop);
    mockProgress = backdrop.props.progress;
    act(() =>
      node('chat-input-effort-slider-control').props.onLayout({
        nativeEvent: { layout: { width: 740 } },
      }),
    );
    act(() => backdrop.parent!.props.onLayout());
  }

  function mount(reasoningEffort: ChatInputReasoningEffort = 'high') {
    const createWithNodeMock = create as unknown as (
      element: ReactElement,
      options: { createNodeMock: () => unknown },
    ) => ReactTestRenderer;
    act(() => {
      renderer = createWithNodeMock(
        <ChatInputEffortOverlay
          onChange={jest.fn()}
          reasoningEffort={reasoningEffort}
          reasoningEfforts={['low', 'high']}
        >
          {(gauge) => <View>{gauge}</View>}
        </ChatInputEffortOverlay>,
        {
          createNodeMock: () => ({
            measureInWindow: (callback: (...frame: number[]) => void) =>
              callback(16, 1040, 788, 100),
          }),
        },
      );
    });
    open();
  }

  function close() {
    act(() =>
      renderer.root
        .findByProps({
          testID: mockKeyboardVisible
            ? 'chat-input-effort-keyboard-backdrop'
            : 'chat-input-effort-backdrop',
        })
        .props.onPress(),
    );
  }

  const shell = () => {
    const computed = style(node('chat-input-effort-slider'));
    return { ...computed, opacity: computed.opacity ?? 1 };
  };
  const contentOpacity = () => effectiveOpacity(node('chat-input-effort-slider-control'));

  function nativeParent(entry: ReactTestInstance): ReactTestInstance {
    let parent = entry.parent;
    while (parent && typeof parent.type !== 'string') parent = parent.parent;
    if (!parent) throw new Error('Expected a native ancestor');
    return parent;
  }

  const contentStyle = () => style(nativeParent(node('chat-input-effort-slider-control')));
  const labelStyle = () => style(nativeParent(node('chat-input-effort-label')));

  // Use the real measured track background (absolute inset-0) and its host height.
  // Intersect the straight rectangles inscribed in both rounded capsules. This is a
  // conservative geometric witness, independent of opacity and endpoint-thumb clipping.
  function foregroundIntersection() {
    const track = renderer.root.findByType(EffortSliderTrack);
    const background = track.find(
      (entry) => typeof entry.type === 'string' && style(entry).backgroundColor === '#111111',
    );
    expect(background.props.className).toContain('inset-0');
    const trackHeight = Number(style(nativeParent(background)).height);
    const trackWidth = Number(track.props.measuredWidth);
    const content = contentStyle();
    const shellStyle = shell();
    const width = Number(shellStyle.width);
    const height = Number(shellStyle.height);
    const left = (width - Number(content.width)) / 2;
    const top = (height - Number(content.height)) / 2;
    return {
      width: Math.max(
        0,
        Math.min(width - height / 2, left + trackWidth - trackHeight / 2) -
          Math.max(height / 2, left + trackHeight / 2),
      ),
      height: Math.max(0, Math.min(height, top + trackHeight) - Math.max(0, top)),
    };
  }

  function visualState() {
    return { shell: shell(), content: contentStyle(), label: labelStyle() };
  }

  test('opening keeps the opaque shell, mount delay, morph and content/label reveal windows', () => {
    mount();
    seek(34);
    expect(mockProgress.value).toBe(0);
    expect(shell()).toMatchObject({ height: 32, opacity: 1, width: 32 });
    expect(contentOpacity()).toBe(0);
    seek(109);
    expect(mockProgress.value).toBeCloseTo(easing.settle.factory()(0.5));
    expect(shell().width).toBeGreaterThan(32);

    for (const [progress, content, label] of [
      [0.25, 0, 0],
      [0.5, 0, 0],
      [0.58, 0.16, 0],
      [0.75, 0.5, 17 / 42],
      [1, 1, 1],
    ] as const) {
      mockProgress.value = progress;
      expect(shell().opacity).toBe(1);
      expect(contentOpacity()).toBeCloseTo(content);
      expect(effectiveOpacity(node('chat-input-effort-label'))).toBeCloseTo(label);
      expect(contentStyle().transform).toBeUndefined();
    }
    seek(184);
    expect(mockProgress.value).toBe(1);
    expect(contentOpacity()).toBe(1);
    expect(shell().opacity).toBe(1);
  });

  test.each(
    [1, 0.95, 0.8, 0.6, 0.50001].flatMap((start) =>
      [false, true].map((keyboard) => ({ start, keyboard })),
    ),
  )(
    'closing at $start is continuous and has no zero-content opaque-shell frame (keyboard=$keyboard)',
    ({ start, keyboard }) => {
      mockKeyboardVisible = keyboard;
      mount();
      mockProgress.value = start;
      const before = visualState();
      close();
      expect(visualState()).toEqual(before);
      expect(shell().opacity).toBe(1);

      const frames = Array.from({ length: mockAnimation!.duration }, (_, milliseconds) => {
        seek(milliseconds);
        return {
          content: contentOpacity(),
          localContent: contentStyle().opacity,
          progress: mockProgress.value,
          shell: shell().opacity,
        };
      });
      expect(frames.some((frame) => frame.content === 0 && frame.shell > 0)).toBe(false);
      expect(frames.some((frame) => frame.shell === 0)).toBe(true);
      for (const frame of frames) {
        const localContent = Math.max(0, 2 * frame.progress - 1);
        expect(frame.localContent).toBeCloseTo(localContent, 12);
        expect(frame.content).toBeCloseTo(localContent * frame.shell, 12);
        expect(frame.shell).toBeCloseTo(Math.max(0, (frame.progress - 0.5) / (start - 0.5)), 12);
      }
      seek(mockAnimation!.duration);
      expect(renderer.root.findAllByProps({ testID: 'chat-input-effort-slider' })).toHaveLength(0);
    },
  );

  test('fully open close bounds the residual fade window', () => {
    mount('low');
    seek(184);
    expect(mockProgress.value).toBe(1);
    close();
    let checkedContentFrames = 0;
    let checkedTailFrames = 0;
    for (let milliseconds = 0; milliseconds < mockAnimation!.duration; milliseconds += 1) {
      seek(milliseconds);
      const shellOpacity = shell().opacity;
      if (contentOpacity() > 0) {
        expect(shellOpacity).toBeLessThanOrEqual(
          interpolate(mockProgress.value, [0.5, 1], [0, 1], Extrapolation.CLAMP),
        );
        checkedContentFrames += 1;
        if (mockProgress.value > 0.5 && mockProgress.value < 0.58) {
          // Fully-open close: shellEffective = 2p - 1, contentEffective = (2p - 1)².
          // At p=0.58 these are 0.16 and 0.0256; the open interval stays strictly below both.
          // contentOpacity() already includes the shell; multiply only the local opacity.
          const contentEffective = shellOpacity * Number(contentStyle().opacity);
          expect(contentEffective).toBeCloseTo(contentOpacity(), 12);
          expect(contentEffective).toBeLessThanOrEqual(0.0256);
          checkedTailFrames += 1;
        }
      }
    }
    expect(checkedContentFrames).toBeGreaterThan(0);
    expect(checkedTailFrames).toBeGreaterThan(0);
    // HEAD kept shell=1 at the same p: at p=0.57, its effective content was 0.14;
    // the current shell=0.14 makes effective content 0.0196. The bound above rejects HEAD.
  });

  test('near-half interruption keeps the unfrozen reveal without claiming perceptible pixels', () => {
    mount('low');
    mockProgress.value = 0.50001;
    const before = visualState();
    close();
    expect(visualState()).toEqual(before);
    for (const fraction of [1, 0.75, 0.5, 0.25, 0.0001, 0]) {
      // Millisecond sampling can skip this narrow interval; probe its interior as well.
      mockProgress.value = 0.5 + (0.50001 - 0.5) * fraction;
      expect(shell().opacity).toBeCloseTo(fraction, 9);
      expect(contentStyle().opacity).toBeCloseTo(2 * (mockProgress.value - 0.5), 12);
      expect(contentStyle().transform).toBeUndefined();
      expect(labelStyle()).toMatchObject({ opacity: 0, transform: [{ translateY: 5 }] });
      expect(contentOpacity() === 0 && shell().opacity > 0).toBe(false);
    }
  });

  test('closing restores the original moving label reveal and translation', () => {
    mount();
    mockProgress.value = 0.8;
    close();
    for (const progress of [0.8, 0.7, 0.6, 0.58, 0.5, 0]) {
      mockProgress.value = progress;
      const reveal = Math.max(0, (progress - 0.58) / 0.42);
      expect(labelStyle().opacity).toBeCloseTo(reveal, 12);
      expect(labelStyle().transform).toEqual([
        { translateY: expect.closeTo(5 * (1 - reveal), 12) },
      ]);
    }
  });

  test.each(
    (['low', 'high'] as const).flatMap((value) =>
      [false, true].map((keyboard) => ({ value, keyboard })),
    ),
  )(
    'fully open close retains real $value track geometry while shell opacity exceeds 0.02 (keyboard=$keyboard)',
    ({ value, keyboard }) => {
      mockKeyboardVisible = keyboard;
      mount(value);
      seek(184);
      close();
      let checkedFrames = 0;
      for (let milliseconds = 0; milliseconds < mockAnimation!.duration; milliseconds += 1) {
        seek(milliseconds);
        if (shell().opacity > 0.02) {
          expect(contentOpacity()).toBeGreaterThan(0);
          expect(contentStyle().transform).toBeUndefined();
          const intersection = foregroundIntersection();
          expect(intersection.width).toBeGreaterThan(0);
          expect(intersection.height).toBeGreaterThan(0);
          checkedFrames += 1;
        }
      }
      expect(checkedFrames).toBeGreaterThan(1);

      // Negative control: removing the real measurement must remove this witness.
      mockProgress.value = 0.55;
      expect(foregroundIntersection().width).toBeGreaterThan(0);
      act(() =>
        node('chat-input-effort-slider-control').props.onLayout({
          nativeEvent: { layout: { width: 0 } },
        }),
      );
      expect(foregroundIntersection().width).toBe(0);
    },
  );

  test.each([1, 0.8, 0.6, 0.50001])(
    'interrupted opening at %s and repeated closes never increase opacity or reveal the shell again',
    (start) => {
      mount('low');
      mockProgress.value = start;
      close();
      const original = mockAnimation!;
      let previousShell = 1;
      let previousContent = contentOpacity();
      let previousLabel = Number(labelStyle().opacity);
      for (let elapsed = 0; elapsed < original.duration; elapsed += 1) {
        advanceTo(original.startedAt + elapsed);
        const expectedProgress = original.from * (1 - original.easing(elapsed / original.duration));
        expect(mockProgress.value).toBeCloseTo(expectedProgress, 12);
        const currentShell = shell().opacity;
        const currentContent = contentOpacity();
        const currentLabel = Number(labelStyle().opacity);
        expect(currentShell).toBeLessThanOrEqual(previousShell);
        expect(currentContent).toBeLessThanOrEqual(previousContent);
        expect(currentLabel).toBeLessThanOrEqual(previousLabel);
        close();
        expect(mockAnimation).toBe(original);
        expect(shell().opacity).toBe(currentShell);
        expect(contentOpacity()).toBe(currentContent);
        previousShell = currentShell;
        previousContent = currentContent;
        previousLabel = currentLabel;
      }
      expect(previousShell).toBe(0);
      advanceTo(original.startedAt + original.duration);
      expect(renderer.root.findAllByProps({ testID: 'chat-input-effort-slider' })).toHaveLength(0);
    },
  );

  // Exclude p0=0: Reanimated completes equal-target withTiming immediately; this mock does not.
  test.each([0.25, 0.4, 0.5])(
    'closing before reveal at %s preserves the opaque reverse morph without new foreground',
    (start) => {
      mount();
      mockProgress.value = start;
      const before = visualState();
      close();
      expect(visualState()).toEqual(before);
      for (let elapsed = 0; elapsed < mockAnimation!.duration; elapsed += 1) {
        seek(elapsed);
        expect(shell().opacity).toBe(1);
        expect(contentStyle().opacity).toBe(0);
        expect(contentOpacity()).toBe(0);
        expect(labelStyle().opacity).toBe(0);
        expect(contentStyle().transform).toBeUndefined();
      }
      seek(mockAnimation!.duration);
      expect(renderer.root.findAllByProps({ testID: 'chat-input-effort-slider' })).toHaveLength(0);
    },
  );

  test('a new open resets the close origin and restores the opaque shell and reveal', () => {
    mount();
    seek(184);
    close();
    seek(250);
    open();
    expect(shell().opacity).toBe(1);
    expect(contentOpacity()).toBe(0);
    mockProgress.value = 0.8;
    expect(shell().opacity).toBe(1);
    expect(contentOpacity()).toBeCloseTo(0.6);
    close();
    expect(mockAnimation!.from).toBe(0.8);
    expect(shell().opacity).toBe(1);
    mockProgress.value = 0.65;
    expect(shell().opacity).toBeCloseTo(0.5);
  });

  test('reduced motion opens and dismisses immediately', () => {
    mockReducedMotion = true;
    mount();
    expect(shell().opacity).toBe(1);
    expect(contentOpacity()).toBe(1);
    close();
    expect(renderer.root.findAllByProps({ testID: 'chat-input-effort-slider' })).toHaveLength(0);
    expect(mockAnimation).toBeUndefined();
  });
});

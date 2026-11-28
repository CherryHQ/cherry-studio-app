import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FlatList, Keyboard, StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatTurnNavigator } from '../chatTurns';
import {
  ChatTurnDirectory,
  getFisheyeTickMetrics,
  MAX_TRIGGER_TICKS,
  resolveTurnDirectoryTickCount,
} from '../components/ChatTurnDirectory';

const mockToastShow = jest.fn();
const mockHaptic = jest.fn();
let mockReducedMotion = false;
let mockDeferExit = false;
let mockExit: ((finished: boolean) => void) | undefined;
const mockTiming = jest.fn(
  (target: number, _config: object, onFinish?: (finished: boolean) => void) => {
    if (target === 0 && mockDeferExit) mockExit = onFinish;
    else onFinish?.(true);
    return target;
  },
);
jest.mock('@cherrystudio/ui/motion', () => ({
  duration: { base: 250, slow: 350 },
  easing: { overshoot: 'overshoot', settle: 'settle' },
}));
jest.mock('@cherrystudio/ui/haptics', () => ({ haptics: { light: () => mockHaptic() } }));
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (id: number) => void, id: number) => fn(id),
}));

jest.mock('@cherrystudio/app-icons/icons/x', () => {
  const React = jest.requireActual('react');
  return function MockXIcon(props: object) {
    return React.createElement('XIcon', props);
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en-US' } }),
}));

jest.mock('@/frontend/appShell/navigation', () => ({
  useFocusedBackPress: () => undefined,
}));

jest.mock('@/frontend/hooks/useLayoutWidth', () => ({
  useLayoutWidth: () => ({ onLayout: jest.fn(), width: 390 }),
}));

jest.mock('react-native-keyboard-controller', () => ({
  useReanimatedKeyboardAnimation: () => ({
    height: { get: () => 0 },
    progress: { get: () => 0 },
  }),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: (read: () => object) => read(),
    useSharedValue: (initial: number) => {
      const { useRef } = jest.requireActual<typeof import('react')>('react');
      return useRef(mockCreateSharedValue(initial)).current;
    },
    useReducedMotion: () => mockReducedMotion,
    ReduceMotion: { System: 'system' },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: (value: number, input: number[], output: number[]) => {
      const index = Math.max(
        1,
        input.findIndex((bound) => value <= bound),
      );
      const fraction = (value - input[index - 1]) / (input[index] - input[index - 1]);
      return output[index - 1] + fraction * (output[index] - output[index - 1]);
    },
    withTiming: (target: number, config: object, onFinish?: (finished: boolean) => void) =>
      mockTiming(target, config, onFinish),
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { Pressable, View } = jest.requireActual('react-native');
  return {
    BackgroundPressExclusion: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, null, children),
    Button: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(Pressable, props, children),
    Spinner: (props: object) => React.createElement('Spinner', props),
    useToast: () => ({ toast: { show: mockToastShow } }),
  };
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const zeroAccessoryHeight = { get: () => 0 } as unknown as SharedValue<number>;

function mockCreateSharedValue(initial: number): SharedValue<number> {
  let value = initial;
  return {
    get: () => value,
    set: (next: number) => {
      value = next;
    },
    get value() {
      return value;
    },
    set value(next: number) {
      value = next;
    },
  } as unknown as SharedValue<number>;
}

function createNavigator(
  scope: string,
  jump: ChatTurnNavigator['jump'] = jest.fn(async () => 'restored' as const),
): ChatTurnNavigator {
  return {
    scope,
    queryKey: ['turns', scope],
    read: jest.fn(async () => ({
      items: [
        { id: 'turn-1', preview: 'First question' },
        { id: 'turn-2', preview: 'Second question' },
      ],
    })),
    jump,
  };
}

function getTickWidths(renderer: ReactTestRenderer): number[] {
  return renderer.root
    .findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'chat-turn-directory-tick',
    )
    .map((node) => {
      const styleEntries = Array.isArray(node.props.style) ? node.props.style : [node.props.style];
      const animated = styleEntries[1] as
        | { transform?: { translateX?: number; scaleY?: number }[]; width?: number }
        | undefined;
      expect(animated?.width).toBeUndefined();
      const flattened = StyleSheet.flatten(node.props.style) as {
        width: number;
        transform?: { translateX?: number }[];
      };
      const translateX =
        flattened.transform?.find((entry) => typeof entry.translateX === 'number')?.translateX ?? 0;
      return flattened.width - translateX;
    });
}

function findTurnRows(renderer: ReactTestRenderer) {
  return renderer.root.findAll(
    (node) =>
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityLabel === 'chat.turns.row' &&
      node.props.accessibilityRole === 'button',
  );
}

describe('getFisheyeTickMetrics', () => {
  test('peaks at focused tick, tapers smoothly across neighbors, and clamps progress', () => {
    const atBottom = Array.from({ length: 7 }, (_, i) => getFisheyeTickMetrics(1, i, 7));
    expect(atBottom[6].width).toBeCloseTo(13);
    expect(atBottom[5].width).toBeGreaterThan(atBottom[4].width);
    expect(atBottom[5].opacity).toBeGreaterThan(atBottom[0].opacity);
    expect(atBottom[6].scaleY).toBe(1);
    expect(atBottom[0].width).toBeCloseTo(5.5);

    const atMid = Array.from({ length: 7 }, (_, i) => getFisheyeTickMetrics(0.5, i, 7));
    expect(atMid[3].width).toBeCloseTo(13);
    expect(atMid[2].width).toBeCloseTo(atMid[4].width);
    expect(atMid[0].width).toBeCloseTo(5.5);

    expect(getFisheyeTickMetrics(-0.5, 0, 7).width).toBeCloseTo(13);
    expect(getFisheyeTickMetrics(1.5, 6, 7).width).toBeCloseTo(13);
  });
});

describe('resolveTurnDirectoryTickCount', () => {
  test.each([
    [undefined, MAX_TRIGGER_TICKS],
    [Number.NaN, MAX_TRIGGER_TICKS],
    [Number.POSITIVE_INFINITY, MAX_TRIGGER_TICKS],
    [-1, 2],
    [0, 2],
    [1, 2],
    [2, 2],
    [4.9, 4],
    [7, 7],
    [10, 7],
  ])('resolves %s turns to %s ticks', (turnCount, expected) => {
    expect(resolveTurnDirectoryTickCount(turnCount)).toBe(expected);
  });
});

describe('ChatTurnDirectory', () => {
  let queryClient: QueryClient;
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReducedMotion = false;
    mockDeferExit = false;
    mockExit = undefined;
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  test.each([false, true])(
    'opens and retains only a noninteractive exit panel (reduced motion=%s)',
    (reduced) => {
      mockReducedMotion = reduced;
      mockDeferExit = true;
      act(() => {
        renderer = create(
          <QueryClientProvider client={queryClient}>
            <ChatTurnDirectory
              bottomAccessoryHeight={zeroAccessoryHeight}
              contentBottomInset={16}
              contentTopInset={96}
              keyboardOffset={0}
              navigator={createNavigator('local:motion')}
              scrollProgress={mockCreateSharedValue(1)}
              scrollToMessage={async () => true}
            />
          </QueryClientProvider>,
        );
      });
      const press = (name: string) =>
        act(() =>
          renderer!.root.findByProps({ testID: `chat-turn-directory-${name}` }).props.onPress(),
        );
      const layer = () => renderer!.root.findByProps({ testID: 'chat-turn-directory-layer' });
      press('trigger');
      expect(mockHaptic).toHaveBeenCalledTimes(1);
      if (!reduced)
        expect(mockTiming.mock.lastCall?.slice(0, 2)).toEqual([
          1,
          { duration: 350, easing: 'overshoot', reduceMotion: 'system' },
        ]);
      expect(
        layer().findAll(
          (node) => StyleSheet.flatten(node.props.style)?.transformOrigin === 'right center',
        )[0],
      ).toBeDefined();

      press('close');
      if (reduced) {
        expect(mockTiming).not.toHaveBeenCalled();
        expect(renderer!.root.findAllByProps({ testID: 'chat-turn-directory-layer' })).toHaveLength(
          0,
        );
        return;
      }
      expect(mockTiming).toHaveBeenLastCalledWith(
        0,
        {
          duration: 250,
          easing: 'settle',
          reduceMotion: 'system',
        },
        expect.any(Function),
      );
      expect(layer().props).toMatchObject({
        pointerEvents: 'none',
        accessibilityElementsHidden: true,
      });

      const oldExit = mockExit;
      press('trigger');
      act(() => oldExit?.(true));
      expect(layer().props.pointerEvents).toBe('box-none');

      press('close');
      act(() => mockExit?.(true));
      expect(renderer!.root.findAllByProps({ testID: 'chat-turn-directory-layer' })).toHaveLength(
        0,
      );
    },
  );

  test('tracks scroll progress across the tick count as the number of turns changes', () => {
    const navigator = createNavigator('local:s1');
    const scrollProgress = mockCreateSharedValue(1);
    const scrollToMessage = jest.fn(async () => true);
    const renderDirectory = (turnCount: number) => (
      <QueryClientProvider client={queryClient}>
        <ChatTurnDirectory
          bottomAccessoryHeight={zeroAccessoryHeight}
          contentBottomInset={16}
          contentTopInset={110}
          keyboardOffset={0}
          navigator={navigator}
          scrollProgress={scrollProgress}
          scrollToMessage={scrollToMessage}
          turnCount={turnCount}
        />
      </QueryClientProvider>
    );

    act(() => {
      renderer = create(renderDirectory(2));
    });
    const bottomWidths = getTickWidths(renderer!);
    expect(bottomWidths).toHaveLength(2);
    expect(bottomWidths[1]).toBeCloseTo(13);
    expect(bottomWidths[0]).toBeLessThan(bottomWidths[1]);

    act(() => {
      scrollProgress.set(0);
      renderer!.update(renderDirectory(2));
    });
    expect(getTickWidths(renderer!)).toEqual(bottomWidths.toReversed());

    act(() => {
      scrollProgress.set(1);
      renderer!.update(renderDirectory(4));
    });
    const intermediateWidths = getTickWidths(renderer!);
    expect(intermediateWidths).toHaveLength(4);
    expect(intermediateWidths[3]).toBeCloseTo(13);
    expect(intermediateWidths[1]).toBeCloseTo(5.5);

    act(() => renderer!.update(renderDirectory(10)));
    const cappedWidths = getTickWidths(renderer!);
    expect(cappedWidths).toHaveLength(7);
    expect(cappedWidths[6]).toBeCloseTo(13);
  });

  test('renders 7 fisheye ticks that track scrollProgress and opens panel with tight scrollbar insets', async () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    const jump = jest.fn(async () => 'restored' as const);
    const scrollToMessage = jest.fn(async () => true);
    const scrollProgress = mockCreateSharedValue(1);
    const navigator = createNavigator('local:s1', jump);

    const renderDirectory = () => (
      <QueryClientProvider client={queryClient}>
        <ChatTurnDirectory
          bottomAccessoryHeight={zeroAccessoryHeight}
          contentBottomInset={16}
          contentTopInset={110}
          keyboardOffset={0}
          navigator={navigator}
          scrollProgress={scrollProgress}
          scrollToMessage={scrollToMessage}
        />
      </QueryClientProvider>
    );

    act(() => {
      renderer = create(renderDirectory());
    });

    let widths = getTickWidths(renderer!);
    expect(widths).toHaveLength(7);
    expect(widths[6]).toBeCloseTo(13);
    expect(widths[0]).toBeCloseTo(5.5);

    act(() => {
      scrollProgress.set(0.5);
      renderer!.update(renderDirectory());
    });
    widths = getTickWidths(renderer!);
    expect(widths[3]).toBeCloseTo(13);

    act(() => {
      scrollProgress.set(0);
      renderer!.update(renderDirectory());
    });
    widths = getTickWidths(renderer!);
    expect(widths[0]).toBeCloseTo(13);
    expect(widths[6]).toBeCloseTo(5.5);

    act(() => {
      scrollProgress.set(1);
      renderer!.update(renderDirectory());
    });

    const trigger = renderer!.root.findByProps({ testID: 'chat-turn-directory-trigger' });
    expect(trigger.props.accessibilityState).toEqual({ expanded: false });
    expect(renderer!.root.findAllByProps({ testID: 'chat-turn-directory' })).toHaveLength(0);

    act(() => {
      trigger.props.onPress();
    });
    await act(settle);

    expect(dismissSpy).toHaveBeenCalledTimes(1);
    const hiddenLayer = renderer!.root
      .findAllByProps({ accessibilityElementsHidden: true })
      .find((node) =>
        node.findAllByProps({ testID: 'chat-turn-directory-trigger' }).includes(trigger),
      );
    expect(hiddenLayer?.props.pointerEvents).toBe('none');
    expect(renderer!.root.findByProps({ testID: 'chat-turn-directory' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'chat-turn-directory-close' })).toBeDefined();

    const list = renderer!.root.findByType(FlatList);
    expect(list.props.automaticallyAdjustsScrollIndicatorInsets).toBe(false);
    expect(list.props.contentContainerStyle).toEqual({
      paddingTop: 6,
      paddingBottom: 10,
      paddingLeft: 8,
      paddingRight: 12,
    });
    expect(list.props.scrollIndicatorInsets).toEqual({ top: 4, bottom: 12, right: 0 });

    const rows = findTurnRows(renderer!);
    expect(rows).toHaveLength(2);
    await act(async () => {
      rows[1]!.props.onPress();
      await settle();
    });

    expect(scrollProgress.get()).toBe(0);
    expect(renderer!.root.findAllByProps({ testID: 'chat-turn-directory' })).toHaveLength(0);
    expect(renderer!.root.findByProps({ testID: 'chat-turn-directory-trigger' })).toBeDefined();
    expect(jump).toHaveBeenCalledWith(
      { id: 'turn-2', preview: 'Second question' },
      scrollToMessage,
    );
    dismissSpy.mockRestore();
  });

  test('restores previous scrollProgress when jump fails and closes via close button or backdrop', async () => {
    const jump = jest.fn(async () => 'retryable' as const);
    const scrollProgress = mockCreateSharedValue(0.8);
    const navigator = createNavigator('local:s1', jump);

    act(() => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <ChatTurnDirectory
            bottomAccessoryHeight={zeroAccessoryHeight}
            contentBottomInset={16}
            contentTopInset={96}
            keyboardOffset={0}
            navigator={navigator}
            scrollProgress={scrollProgress}
            scrollToMessage={jest.fn(async () => true)}
          />
        </QueryClientProvider>,
      );
    });

    act(() => {
      renderer!.root.findByProps({ testID: 'chat-turn-directory-trigger' }).props.onPress();
    });
    await act(settle);
    expect(renderer!.root.findByProps({ testID: 'chat-turn-directory' })).toBeDefined();

    const rows = findTurnRows(renderer!);
    expect(rows).toHaveLength(2);
    await act(async () => {
      rows[1]!.props.onPress();
      await settle();
    });
    expect(scrollProgress.get()).toBe(0.8);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.turns.jumpFailed',
      variant: 'danger',
    });

    act(() => {
      renderer!.root.findByProps({ testID: 'chat-turn-directory-trigger' }).props.onPress();
    });
    await act(settle);
    expect(renderer!.root.findByProps({ testID: 'chat-turn-directory' })).toBeDefined();

    act(() => {
      renderer!.root.findByProps({ testID: 'chat-turn-directory-close' }).props.onPress();
    });
    expect(renderer!.root.findAllByProps({ testID: 'chat-turn-directory' })).toHaveLength(0);
    expect(renderer!.root.findByProps({ testID: 'chat-turn-directory-trigger' })).toBeDefined();

    act(() => {
      renderer!.root.findByProps({ testID: 'chat-turn-directory-trigger' }).props.onPress();
    });
    await act(settle);
    expect(renderer!.root.findByProps({ testID: 'chat-turn-directory' })).toBeDefined();

    act(() => {
      renderer!.root.findByProps({ testID: 'chat-turn-directory-backdrop' }).props.onPress();
    });
    expect(renderer!.root.findAllByProps({ testID: 'chat-turn-directory' })).toHaveLength(0);
    expect(renderer!.root.findByProps({ testID: 'chat-turn-directory-trigger' })).toBeDefined();
  });
});

import { View } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { ChatInputEffortOverlay } from '../ChatInputEffortOverlay';

const mockInteractionOrder: string[] = [];
const mockDismissField = jest.fn(async () => {
  mockInteractionOrder.push('dismiss');
});

jest.mock('@/frontend/components/composer', () => ({
  useComposerFieldDismiss: () => mockDismissField,
}));

jest.mock('@/frontend/components/SlotText', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');

  return {
    SlotText: ({ testID, text }: { testID?: string; text: string }) =>
      React.createElement(Text, { testID }, text),
  };
});

jest.mock('../ChatInputEffortGauge', () => {
  const React = jest.requireActual('react');
  const { Pressable } = jest.requireActual('react-native');

  return {
    ChatInputEffortGauge: ({ onPress }: { onPress: () => void }) =>
      React.createElement(Pressable, { onPress, testID: 'chat-input-effort-gauge' }),
  };
});

jest.mock('../../effortSlider', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    EffortSlider: (props: object) => React.createElement(View, props),
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    Portal: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, { ...props, mockComponent: 'portal' }, children),
    Surface: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({ backgroundColor: '#222222' }),
}));

type SharedValueStub = { set: (next: number) => void; value: number };

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View },
    Easing: { bezier: () => 'bezier', linear: 'linear' },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: (value: number, input: number[], output: number[]) => {
      const progress = Math.max(0, Math.min(1, (value - input[0]!) / (input[1]! - input[0]!)));
      return output[0]! + (output[1]! - output[0]!) * progress;
    },
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => false,
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
    withTiming: (value: number, _config: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return value;
    },
  };
});

(View as unknown as { prototype: Record<string, unknown> }).prototype.measureInWindow = (
  callback: (x: number, y: number, width: number, height: number) => void,
) => {
  mockInteractionOrder.push('measure');
  callback(16, 700, 360, 96);
};

describe('ChatInputEffortOverlay', () => {
  let renderer: ReactTestRenderer | undefined;
  let originalRequestAnimationFrame: typeof requestAnimationFrame;

  beforeAll(() => {
    originalRequestAnimationFrame = global.requestAnimationFrame;
    global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame;
  });

  afterAll(() => {
    global.requestAnimationFrame = originalRequestAnimationFrame;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    mockInteractionOrder.length = 0;
    jest.clearAllMocks();
  });

  function renderOverlay(reasoningEfforts: readonly ('default' | 'low' | 'high')[]) {
    act(() => {
      renderer = create(
        <ChatInputEffortOverlay
          modelLabel="Model"
          onChange={jest.fn()}
          reasoningEffort="low"
          reasoningEfforts={reasoningEfforts}
        >
          {(gauge) => <View testID="composer-content">{gauge}</View>}
        </ChatInputEffortOverlay>,
      );
    });

    return renderer!;
  }

  function press(root: ReactTestInstance, testID: string) {
    const target = root
      .findAllByProps({ testID })
      .find((node) => typeof node.props.onPress === 'function');
    target?.props.onPress();
  }

  it('dismisses the field before measuring and closes from the outside backdrop', async () => {
    const tree = renderOverlay(['default', 'low', 'high']);

    await act(async () => {
      press(tree.root, 'chat-input-effort-gauge');
      await Promise.resolve();
    });

    expect(mockInteractionOrder).toEqual(['dismiss', 'measure']);
    expect(tree.root.findAllByProps({ mockComponent: 'portal' }).length).toBeGreaterThan(0);

    act(() => press(tree.root, 'chat-input-effort-backdrop'));

    expect(tree.root.findAllByProps({ mockComponent: 'portal' })).toHaveLength(0);
  });
});

import type { ReactElement, ReactNode } from 'react';
import { BackHandler, Platform, Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { useExpandAnswer } from '../../context/ExpandAnswerContext';
import { ExpandedAnswerProvider } from '../ExpandedAnswer';

const mockSelectBranch = jest.fn();
let mockAnswers = new Map<string, MessageListItem>();
let mockFocused = true;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const isFocused = mockFocused;
    useEffect(() => (isFocused ? effect() : undefined), [effect, isFocused]);
  },
}));

jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  const actual = jest.requireActual('react-native');
  const MockView = React.forwardRef(function MockView(
    props: Record<string, unknown>,
    ref: React.Ref<unknown>,
  ) {
    return React.createElement('MeasuredView', { ...props, ref });
  });
  return Object.defineProperties(Object.create(actual), {
    useWindowDimensions: {
      value: () => ({ fontScale: 1, height: 874, scale: 3, width: 402 }),
    },
    View: { value: MockView },
  });
});

// Finishes at once, so opening and closing complete within the test's act.
const finishAtOnce = (to: unknown, _config: unknown, done?: (finished: boolean) => void) => {
  done?.(true);
  return to;
};
const mockWithTiming = jest.fn(finishAtOnce);
const mockWithSpring = finishAtOnce;

jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: () => 0,
    runOnJS: (fn: unknown) => fn,
    useAnimatedReaction: () => undefined,
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    useSharedValue: (initial: unknown) => {
      const ref = useRef({
        get: () => ref.current.value,
        set: (next: unknown) => (ref.current.value = next),
        value: initial,
      });
      return ref.current;
    },
    withSpring: (...args: Parameters<typeof finishAtOnce>) => mockWithSpring(...args),
    withTiming: (...args: Parameters<typeof finishAtOnce>) => mockWithTiming(...args),
  };
});

jest.mock('react-native-gesture-handler', () => ({
  Gesture: { Native: () => ({ disallowInterruption: () => ({}) }) },
  GestureDetector: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@cherrystudio/app-icons/icons/x', () => () => null);

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    BackgroundPressExclusion: ({ children }: { children: ReactNode }) => children,
    Button: (props: object) => createElement('Button', props),
    ContextMenuExclusion: ({ children }: { children: ReactNode }) => children,
    Skeleton: () => null,
  };
});

jest.mock('@cherrystudio/ui/motion', () => ({
  duration: { base: 1, fast: 1, slow: 1 },
  easing: { settle: undefined },
}));

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

jest.mock('@/frontend/components/Avatar', () => ({ ModelAvatar: () => null }));

jest.mock('@/frontend/components/Message', () => {
  const { createElement } = jest.requireActual('react');
  return {
    AssistantMessage: ({ children, message }: { children: ReactNode; message: MessageListItem }) =>
      createElement('AssistantMessage', { message }, children),
  };
});

jest.mock('../../../../runtime', () => ({
  useAgentAnswers: () => ({ answers: mockAnswers, isError: false, refetch: jest.fn() }),
}));

jest.mock('../../../ConversationMessageContent', () => ({
  ConversationAttachments: () => null,
  ConversationMessageContent: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('../../context/AssistantMessageActionsProvider', () => ({
  useAssistantMessageActions: () => ({ selectBranch: mockSelectBranch }),
}));

jest.mock('../../context/ChatMessageRowContext', () => ({ useChatMessageRow: () => ({}) }));

jest.mock('../../context/ChatSessionContext', () => ({ useChatSessionId: () => 's1' }));

jest.mock('../../translation/MessageTranslation', () => ({
  MessageTranslationContent: () => null,
}));

jest.mock('../AssistantMessageToolbar', () => {
  const { createElement } = jest.requireActual('react');
  return { AssistantMessageToolbar: (props: object) => createElement('Toolbar', props) };
});

jest.mock('../MessageAnswerCards', () => ({
  AnswerDots: () => null,
  AnswerStatus: () => null,
  useAnswerGroup: (row: MessageListItem) => ({
    models: [],
    names: (row.branch?.siblings ?? []).map((sibling) => `name:${sibling.id}`),
    siblings: row.branch?.siblings ?? [],
  }),
}));

describe('ExpandedAnswerProvider', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused = true;
    mockSelectBranch.mockResolvedValue(true);
    mockAnswers = new Map([
      ['a1', answer('a1')],
      ['a2', answer('a2')],
    ]);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  test('opens the answer over the screen with its own actions', async () => {
    await open('a1');

    expect(title()).toBe('name:a1');
    expect(toolbar().props.message.id).toBe('a1');
    expect(layer().props.style).toEqual({ height: 874, width: 402 });
  });

  test('the layer grows once its answer has laid out, so mounting it does not skip the motion', async () => {
    await open('a1', undefined, { layOut: false });
    expect(mockWithTiming).not.toHaveBeenCalled();

    act(() => content().props.onLayout());
    expect(mockWithTiming).toHaveBeenCalledWith(1, expect.anything(), expect.any(Function));
  });

  test('opening another answer shows it at once, and returns if it could not be shown', async () => {
    let settle: (applied: boolean) => void = () => {};
    await open('a2', new Promise<boolean>((resolve) => (settle = resolve)));
    expect(title()).toBe('name:a2');
    // The card that opened it owns that selection.
    expect(mockSelectBranch).not.toHaveBeenCalled();

    await act(async () => settle(false));
    expect(title()).toBe('name:a1');
  });

  test('a swipe across shows the next answer, and returns when the choice is refused', async () => {
    let settle: (applied: boolean) => void = () => {};
    mockSelectBranch.mockReturnValue(new Promise<boolean>((resolve) => (settle = resolve)));
    await open('a1');

    swipeTo(402);
    expect(mockSelectBranch).toHaveBeenCalledWith({ messageId: 'a1', targetId: 'a2' });
    expect(title()).toBe('name:a2');
    expect(toolbar().props.message.id).toBe('a2');

    await act(async () => settle(false));
    expect(title()).toBe('name:a1');
  });

  test('a scroll that ends without a swipe, as after layout, keeps the answer', async () => {
    await open('a1');

    act(() => pager().props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 402 } } }));
    expect(mockSelectBranch).not.toHaveBeenCalled();
    expect(title()).toBe('name:a1');
  });

  test('Reply closes the expanded layer while its toolbar keeps the exact displayed sibling', async () => {
    mockSelectBranch.mockResolvedValue(true);
    await open('a1');
    swipeTo(402);
    expect(toolbar().props.message.id).toBe('a2');
    act(() => toolbar().props.onReply());
    expect(renderer!.root.findAllByProps({ testID: 'expanded-answer' })).toHaveLength(0);
  });

  test('closing shrinks the layer away', async () => {
    await open('a1');

    await act(async () => close().props.onPress());
    // The screen is released first; the layer goes a frame later.
    await act(() => new Promise(requestAnimationFrame));
    expect(renderer!.root.findAllByProps({ testID: 'expanded-answer' })).toHaveLength(0);
  });

  test('Android back closes the layer, but leaves it to a route pushed over the chat', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    // The latest subscription runs first, as on Android.
    const backListeners: Parameters<typeof BackHandler.addEventListener>[1][] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
      backListeners.push(listener);
      return { remove: () => backListeners.splice(backListeners.indexOf(listener), 1) };
    });
    const pressBack = () =>
      act(async () => {
        backListeners
          .toReversed()
          .some((listener) => listener({ timeStamp: 0, type: 'hardwareBackPress' }));
      });
    const navigatorBack = jest.fn(() => true);
    backListeners.push(navigatorBack);
    await open('a1');

    mockFocused = false;
    act(() => renderer!.update(tree([row()])));
    await pressBack();
    expect(navigatorBack).toHaveBeenCalledTimes(1);
    expect(layer()).toBeTruthy();

    mockFocused = true;
    act(() => renderer!.update(tree([row()])));
    await pressBack();
    await act(() => new Promise(requestAnimationFrame));
    expect(navigatorBack).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findAllByProps({ testID: 'expanded-answer' })).toHaveLength(0);
  });

  test('the layer closes once its answers are gone, as after deleting the turn', async () => {
    await open('a1');

    act(() => renderer!.update(tree([])));
    expect(renderer!.root.findAllByProps({ testID: 'expanded-answer' })).toHaveLength(0);
  });

  async function open(id: string, selection?: Promise<boolean>, { layOut = true } = {}) {
    const createWithNodeMock = create as unknown as (
      element: ReactElement,
      options: { createNodeMock: () => unknown },
    ) => ReactTestRenderer;
    act(() => {
      renderer = createWithNodeMock(tree([row()]), {
        createNodeMock: () => ({
          measureInWindow: (callback: (...frame: number[]) => void) => callback(0, 0, 402, 758),
          scrollTo: () => undefined,
          scrollToEnd: () => undefined,
        }),
      });
    });
    act(() => renderer!.root.findByProps({ testID: 'open' }).props.onPress({ id, selection }));
    const probe = renderer!.root.find(
      (node) => node.props.pointerEvents === 'none' && typeof node.props.onLayout === 'function',
    );
    await act(async () => probe.props.onLayout());
    if (layOut) act(() => content().props.onLayout());
  }

  function tree(messages: MessageListItem[]) {
    return (
      <ExpandedAnswerProvider messages={messages} renderUsage={undefined}>
        <Opener />
      </ExpandedAnswerProvider>
    );
  }

  function swipeTo(x: number) {
    act(() => pager().props.onScrollBeginDrag());
    act(() => pager().props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x } } }));
  }

  function layer() {
    return renderer!.root.find(
      (node) => typeof node.type === 'string' && node.props.testID === 'expanded-answer',
    );
  }

  function content() {
    return renderer!.root.find(
      (node) =>
        typeof node.type !== 'string' &&
        typeof node.props.onLayout === 'function' &&
        Array.isArray(node.props.style),
    );
  }

  function pager() {
    return renderer!.root.find(
      (node) => node.props.pagingEnabled === true && typeof node.type !== 'string',
    );
  }

  function title() {
    return renderer!.root.find((node) => node.props.accessibilityRole === 'header').props.children;
  }

  function toolbar() {
    return renderer!.root.findByType('Toolbar' as never);
  }

  function close() {
    return renderer!.root.findByProps({ testID: 'expanded-answer-close' });
  }
});

function Opener() {
  const expand = useExpandAnswer();
  return (
    <Pressable
      onPress={
        ((request: { id: string; selection?: Promise<boolean> }) =>
          expand?.({ ...request, measure: async () => undefined })) as never
      }
      testID="open"
    />
  );
}

function answer(id: string): MessageListItem {
  return {
    data: { parts: [{ state: 'done', text: id, type: 'text' }] },
    id,
    role: 'assistant',
    status: 'success',
  };
}

function row(): MessageListItem {
  return {
    ...answer('a1'),
    branch: {
      key: 'answers:q1',
      siblings: [
        { id: 'a1', modelId: 'anthropic::claude', status: 'success' },
        { id: 'a2', modelId: 'openai::gpt', status: 'success' },
      ],
    },
  };
}

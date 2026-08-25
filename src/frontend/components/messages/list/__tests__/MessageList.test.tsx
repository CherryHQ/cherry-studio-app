import type { LegendListRef } from '@legendapp/list/react-native';
import type { ReactNode, Ref } from 'react';
import { Platform, type LayoutChangeEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Message } from '@/shared/data/types/message';

import { MessageList } from '../../MessageList';
import type { MessageSlideInFlight } from '../../motion/useMessageSlideInFlight';
import type { MessageListProps, MessageListItem } from '../../types';

jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

type AnchoredEndSpaceConfig = {
  anchorIndex?: number;
  anchorMaxSize?: number;
  onReady?: (info: { anchorKey: string | undefined }) => void;
  onSizeChanged?: (size: number) => void;
};

type MockLegendListProps = {
  alignItemsAtEnd?: boolean;
  applyWorkaroundForContentInsetHitTestBug?: boolean;
  anchoredEndSpace?: AnchoredEndSpaceConfig;
  contentContainerStyle?: { paddingBottom?: number; paddingTop?: number };
  data?: readonly MessageListItem[];
  extraData?: unknown;
  freeze?: unknown;
  getItemType?: (item: MessageListItem) => string;
  keyboardDismissMode?: string;
  keyboardLiftBehavior?: string;
  keyboardOffset?: number;
  maintainVisibleContentPosition?: unknown;
  onContentSizeChange?: (width: number, height: number) => void;
  onItemSizeChanged?: (info: {
    index: number;
    itemKey: string;
    previous: number;
    size: number;
  }) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onMomentumScrollBegin?: () => void;
  onMomentumScrollEnd?: () => void;
  onScrollBeginDrag?: () => void;
  onScrollEndDrag?: () => void;
  onStartReached?: () => void;
  onTouchEnd?: () => void;
  onTouchStart?: () => void;
  ref?: Ref<LegendListRef>;
  renderItem?: (info: { index: number; item: MessageListItem }) => ReactNode;
  sharedValues?: { isAtEnd: SharedValue<boolean>; scrollOffset: SharedValue<number> };
  showsVerticalScrollIndicator?: boolean;
};

let mockLatestListProps: MockLegendListProps | undefined;
const mockFreeze = { get: jest.fn(), set: jest.fn(), value: false };
const mockScrollMessageToEnd = jest.fn(async () => undefined);
const mockListScrollToEndMethod = jest.fn(async () => undefined);
let mockListMetrics = { contentLength: 500, scroll: 0, scrollLength: 500 };
const mockLegendListRef = {
  getState: () => mockListMetrics,
  scrollToEnd: mockListScrollToEndMethod,
} as unknown as LegendListRef;
function mockCreateSharedValue<T>(initial: T): SharedValue<T> {
  const shared = {
    get: () => shared.value,
    set: (next: T) => {
      shared.value = next;
    },
    value: initial,
  };

  return shared as unknown as SharedValue<T>;
}
const mockRenderMessage = jest.fn((_message: MessageListItem) => null);
let mockSlideInFlight: MessageSlideInFlight | undefined;
let mockScrollButtonProps:
  | {
      accessibilityLabel: string;
      bottomAccessoryHeight: SharedValue<number>;
      gap: number;
      isAtBottom: boolean;
      onPress: () => void;
    }
  | undefined;
let mockFontSizeStep = 0;
type MockAnimatedReaction = {
  prepare: () => unknown;
  react: (current: unknown, previous: unknown) => void;
};
let mockAnimatedReactions: MockAnimatedReaction[] = [];
jest.mock('@legendapp/list/keyboard', () => {
  const { Fragment: MockFragment } = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');
  const { useLayoutEffect: useMockLayoutEffect } = jest.requireActual('react');

  return {
    KeyboardAwareLegendList: (props: MockLegendListProps) => {
      mockLatestListProps = props;
      useMockLayoutEffect(() => {
        if (typeof props.ref === 'function') {
          props.ref(mockLegendListRef);
        } else if (props.ref) {
          props.ref.current = mockLegendListRef;
        }

        return () => {
          if (typeof props.ref === 'function') {
            props.ref(null);
          } else if (props.ref) {
            props.ref.current = null;
          }
        };
      }, [props.ref]);

      return (
        <MockView testID="message-list">
          {props.data?.map((item, index) => (
            <MockFragment key={item.id}>{props.renderItem?.({ index, item })}</MockFragment>
          ))}
        </MockView>
      );
    },
    useKeyboardScrollToEnd: () => ({
      freeze: mockFreeze,
      scrollMessageToEnd: mockScrollMessageToEnd,
    }),
  };
});

jest.mock('@cherrystudio/ui/components', () => ({
  ScrollToBottomButton: (props: {
    accessibilityLabel: string;
    bottomAccessoryHeight: SharedValue<number>;
    gap: number;
    isAtBottom: boolean;
    onPress: () => void;
  }) => {
    mockScrollButtonProps = props;
    return null;
  },
  ScrollShadow: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => `translated:${key}` }),
}));

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [mockFontSizeStep, jest.fn()],
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ debug: jest.fn() }),
  },
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    // motion 词汇表在模块顶层就求值这两个，缺了会让整套件加载失败。
    Easing: { bezier: () => 'bezier', linear: 'linear' },
    ReduceMotion: { System: 'system' },
    // 入场飞行的弹簧直接落到终值：这里要断言的是「装填了多少、什么时候开火」，不是曲线本身。
    withSpring: (toValue: number) => toValue,
    runOnJS: (fn: unknown) => fn,
    useAnimatedReaction: (
      prepare: MockAnimatedReaction['prepare'],
      react: MockAnimatedReaction['react'],
    ) => {
      const reactionRef = React.useRef<MockAnimatedReaction | null>(null);

      if (reactionRef.current) {
        reactionRef.current.prepare = prepare;
        reactionRef.current.react = react;
      } else {
        reactionRef.current = { prepare, react };
        mockAnimatedReactions.push(reactionRef.current);
      }
    },
    // 语义等价于「持有可变盒子的 useRef」：每个调用点一个独立实例（组件里有多个 shared
    // value，共用一个对象会互相污染），且跨渲染保持同一身份——否则重渲后组件换用新盒子，
    // 测试握着的旧引用就再也影响不了组件，断言会静默失真。
    useSharedValue: <T,>(initial: T) => {
      const ref = React.useRef<SharedValue<T> | null>(null);
      ref.current ??= mockCreateSharedValue(initial);
      return ref.current;
    },
  };
});

jest.mock('../../motion/MessageSlideInProvider', () => ({
  MessageSlideInProvider: ({
    children,
    flight,
  }: {
    children: ReactNode;
    flight: MessageSlideInFlight;
  }) => {
    mockSlideInFlight = flight;
    return children;
  },
}));

function createMessage(
  id: string,
  role: MessageListItem['role'],
  parts: Message['data']['parts'] = [],
): MessageListItem {
  return {
    data: { parts },
    id,
    role,
    status: role === 'assistant' ? 'pending' : 'success',
  };
}

function textPart(text: string): NonNullable<Message['data']['parts']>[number] {
  return { text, type: 'text' };
}

function filePart(): NonNullable<Message['data']['parts']>[number] {
  return {
    filename: 'photo.png',
    mediaType: 'image/png',
    type: 'file',
    url: 'file:///photo.png',
  };
}

function listProps(
  messages: readonly MessageListItem[],
  enteringMessageId?: string,
): MessageListProps {
  return {
    contentBottomInset: 80,
    contentTopInset: 44,
    ...(enteringMessageId ? { enteringMessageId } : {}),
    keyboardOffset: 26,
    messages,
    onLoadOlder: jest.fn(async () => undefined),
    renderMessage: mockRenderMessage,
  };
}

describe('MessageList anchoring and manual scrolling', () => {
  let renderer: ReactTestRenderer | undefined;
  let cancelAnimationFrameSpy: jest.SpyInstance;
  let frameCallbacks: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let requestAnimationFrameSpy: jest.SpyInstance;

  const flushAnimationFrames = () => {
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    callbacks.forEach((callback) => callback(0));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockListMetrics = { contentLength: 500, scroll: 0, scrollLength: 500 };
    mockAnimatedReactions = [];
    mockFontSizeStep = 0;
    mockLatestListProps = undefined;
    mockScrollButtonProps = undefined;
    mockSlideInFlight = undefined;
    frameCallbacks = new Map();
    nextFrameId = 1;
    requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        const frameId = nextFrameId++;
        frameCallbacks.set(frameId, callback);
        return frameId;
      });
    cancelAnimationFrameSpy = jest
      .spyOn(global, 'cancelAnimationFrame')
      .mockImplementation((frameId) => {
        if (frameId != null) {
          frameCallbacks.delete(frameId);
        }
      });
  });

  test('delegates every role to the feature renderer and forwards its external state', () => {
    const user = createMessage('user-1', 'user', [textPart('hello')]);
    const assistant = createMessage('assistant-1', 'assistant');
    const extraData = { generation: 'running' };

    act(() => {
      renderer = create(<MessageList {...listProps([user, assistant])} extraData={extraData} />);
    });

    expect(mockRenderMessage).toHaveBeenNthCalledWith(1, user);
    expect(mockRenderMessage).toHaveBeenNthCalledWith(2, assistant);
    expect(mockLatestListProps?.extraData).toBe(extraData);
  });

  test('does not show the scroll control for an empty message list', () => {
    act(() => {
      renderer = create(
        <MessageList {...listProps([])} bottomAccessoryHeight={{ value: 80 } as never} />,
      );
    });

    expect(mockScrollButtonProps).toBeUndefined();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    cancelAnimationFrameSpy.mockRestore();
    requestAnimationFrameSpy.mockRestore();
  });

  test('caps text anchors at two current body lines and leaves file anchors uncapped', () => {
    const textMessages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];

    act(() => {
      renderer = create(<MessageList {...listProps(textMessages)} />);
    });

    expect(mockLatestListProps?.anchoredEndSpace?.anchorMaxSize).toBe(80);

    mockFontSizeStep = 2;
    act(() => renderer?.update(<MessageList {...listProps(textMessages)} />));
    expect(mockLatestListProps?.anchoredEndSpace?.anchorMaxSize).toBe(84);

    const fileMessages = [
      createMessage('user-1', 'user', [filePart()]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => renderer?.update(<MessageList {...listProps(fileMessages)} />));

    expect(mockLatestListProps?.anchoredEndSpace?.anchorMaxSize).toBeUndefined();
  });

  test('dispatches user and assistant rows with role-based recycling types', () => {
    const userMessage = createMessage('user-1', 'user', [textPart('hello')]);
    const emptyAssistantMessage = createMessage('assistant-1', 'assistant');
    const streamingAssistantMessage = createMessage('assistant-2', 'assistant', [textPart('hi')]);

    act(() => {
      renderer = create(<MessageList {...listProps([userMessage, emptyAssistantMessage])} />);
    });

    expect(mockRenderMessage).toHaveBeenCalledWith(userMessage);
    expect(mockRenderMessage).toHaveBeenCalledWith(emptyAssistantMessage);
    expect(mockLatestListProps?.getItemType?.(userMessage)).toBe('user');
    // 空助手行是加载点占位，不能继承成稿长回复的尺寸均值，否则新建时会先占住上一条回复的
    // 高度再塌回去。第一个 chunk 落地后才归入 assistant，那时行还很小。
    expect(mockLatestListProps?.getItemType?.(emptyAssistantMessage)).toBe('assistant-empty');
    expect(mockLatestListProps?.getItemType?.(streamingAssistantMessage)).toBe('assistant');
  });

  test('derives the anchor from the latest user message', () => {
    const messages = [
      createMessage('assistant-0', 'assistant'),
      createMessage('user-1', 'user'),
      createMessage('assistant-1', 'assistant'),
      createMessage('user-2', 'user'),
      createMessage('assistant-2', 'assistant'),
    ];

    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });

    expect(mockLatestListProps?.anchoredEndSpace?.anchorIndex).toBe(3);

    act(() => {
      renderer?.update(<MessageList {...listProps([createMessage('assistant-3', 'assistant')])} />);
    });

    expect(mockLatestListProps?.anchoredEndSpace).toBeUndefined();
  });

  test('wires pagination only when an older-message loader is provided', () => {
    const props = listProps([createMessage('user-1', 'user')]);
    const onLoadOlder = props.onLoadOlder;

    act(() => {
      renderer = create(<MessageList {...props} />);
    });
    act(() => mockLatestListProps?.onStartReached?.());

    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    const { onLoadOlder: _onLoadOlder, ...withoutPagination } = listProps([
      createMessage('user-1', 'user'),
    ]);
    act(() => renderer?.update(<MessageList {...withoutPagination} />));

    expect(mockLatestListProps?.onStartReached).toBeUndefined();
  });

  test('owns the entering-message provider and optional scroll button', () => {
    const bottomAccessoryHeight = {
      get: jest.fn(() => 88),
      set: jest.fn(),
      value: 88,
    } as unknown as SharedValue<number>;
    const props = {
      ...listProps([createMessage('user-1', 'user')], 'user-1'),
      bottomAccessoryHeight,
    };

    act(() => {
      renderer = create(<MessageList {...props} />);
    });

    expect(mockSlideInFlight?.activeMessageId.get()).toBe('user-1');
    expect(mockScrollButtonProps).toMatchObject({
      accessibilityLabel: 'translated:chat.message.scrollToBottom',
      bottomAccessoryHeight,
      gap: 5,
    });

    // 停在底部时隐藏。
    expect(mockScrollButtonProps?.isAtBottom).toBe(true);

    act(() => mockScrollButtonProps?.onPress());
    expect(mockListScrollToEndMethod).toHaveBeenCalledWith({ animated: true });

    mockScrollButtonProps = undefined;
    act(() => renderer?.update(<MessageList {...listProps(props.messages)} />));

    expect(mockScrollButtonProps).toBeUndefined();
    // 入场 id 落地后刻意不清：待发消息落库常在飞行中途，清掉会让行当帧跳回落点。
    expect(mockSlideInFlight?.activeMessageId.get()).toBe('user-1');
  });

  test('reserves the composer height in the scrollable message content', () => {
    const messages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];

    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });

    expect(mockLatestListProps?.applyWorkaroundForContentInsetHitTestBug).toBe(true);

    act(() => {
      mockLatestListProps?.onLayout?.({
        nativeEvent: { layout: { height: 600, width: 390, x: 0, y: 0 } },
      } as LayoutChangeEvent);
    });

    expect(mockLatestListProps?.keyboardOffset).toBe(26);
    // 键盘抬升模式是硬契约，不是口味：`persistent` 的收起分支同样不产生位移，但它的
    // 抬起分支恒抬且收起时保住抬升量，在历史区反复聚焦会像棘轮一样把列表推到底；
    // `always` 走的是「按记录量回退」那条路，续轮发送会重现 310px 反向跳。
    // 真实行为在 worklet 里，单测够不着，这行断言是拦住顺手改模式的唯一闸门。
    expect(mockLatestListProps?.keyboardLiftBehavior).toBe('whenAtEnd');
    expect(mockLatestListProps?.showsVerticalScrollIndicator).toBe(false);
    expect(mockLatestListProps?.contentContainerStyle).toEqual({
      paddingBottom: 80,
      paddingTop: 12,
    });
  });

  test('uses a keyboard dismissal mode supported by Android', () => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });

    try {
      act(() => {
        renderer = create(<MessageList {...listProps([createMessage('user-1', 'user')])} />);
      });

      expect(mockLatestListProps?.keyboardDismissMode).toBe('on-drag');
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  });

  test('never lets the reveal gate scroll away from a finger on the list', () => {
    const messages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    const settleContent = () => {
      act(() => {
        mockLatestListProps?.onLayout?.({
          nativeEvent: { layout: { height: 600, width: 390, x: 0, y: 0 } },
        } as LayoutChangeEvent);
        mockLatestListProps?.onContentSizeChange?.(390, 900);
      });
      act(() => flushAnimationFrames());
      act(() => flushAnimationFrames());
    };

    // 基线：没人碰列表时闸门先滚到底再揭示。缺了这一半，下面的断言在闸门根本没触发时也会绿。
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} onReady={jest.fn()} />);
    });
    settleContent();
    expect(mockListScrollToEndMethod).toHaveBeenCalledWith({ animated: false });

    act(() => renderer?.unmount());
    mockListScrollToEndMethod.mockClear();

    // 流式每来一个 chunk 内容高度就变一次，闸门（依赖 contentBaseHeight）于是在整段流式里反复重跑。
    // 手指在列表上时它必须放行，否则拖动会被硬拽回底部。
    const onReady = jest.fn();
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} onReady={onReady} />);
    });
    act(() => {
      mockLatestListProps?.onTouchStart?.();
      mockLatestListProps?.onScrollBeginDrag?.();
    });
    settleContent();

    expect(mockListScrollToEndMethod).not.toHaveBeenCalled();
  });

  test('positions once before the reveal even while streaming restarts the settle window', () => {
    const messages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];

    act(() => {
      renderer = create(<MessageList {...listProps(messages)} onReady={jest.fn()} />);
    });
    act(() => {
      mockLatestListProps?.onLayout?.({
        nativeEvent: { layout: { height: 600, width: 390, x: 0, y: 0 } },
      } as LayoutChangeEvent);
    });

    // 每个 chunk 都会改内容高度，闸门（依赖 contentBaseHeight）因此整段流式反复重跑，静默窗口
    // 永远等不到完成、ready 也就永远报不出来。定位本身是一次性事件：重跑只该重启静默窗口，
    // 不该再滚一次。放开这条约束时实测新建话题一轮里滚了 45-75 次，全落在「内容不满一屏」阶段，
    // 表现为 offset 在 0 与 24/40 之间来回弹。
    for (const height of [900, 940, 980, 1020, 1060]) {
      act(() => mockLatestListProps?.onContentSizeChange?.(390, height));
      act(() => flushAnimationFrames());
      act(() => flushAnimationFrames());
    }

    expect(mockListScrollToEndMethod).toHaveBeenCalledTimes(1);
  });

  test('keeps the viewport stationary as streamed content grows', () => {
    const userMessage = createMessage('user-1', 'user', [textPart('hello')]);
    const messages = [userMessage, createMessage('assistant-1', 'assistant')];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });

    expect(mockLatestListProps?.maintainVisibleContentPosition).toMatchObject({ data: true });

    act(() => mockLatestListProps?.anchoredEndSpace?.onSizeChanged?.(0));
    act(() =>
      mockLatestListProps?.onItemSizeChanged?.({
        index: 1,
        itemKey: 'assistant-1',
        previous: 120,
        size: 1_120,
      }),
    );
    act(() =>
      renderer?.update(
        <MessageList
          {...listProps([
            userMessage,
            createMessage('assistant-1', 'assistant', [textPart('streamed content')]),
          ])}
        />,
      ),
    );

    expect(mockLatestListProps?.maintainVisibleContentPosition).toMatchObject({ data: true });
    expect(mockListScrollToEndMethod).not.toHaveBeenCalled();
    expect(mockScrollMessageToEnd).not.toHaveBeenCalled();
  });

  test('shows the scroll control immediately when streaming leaves the end', () => {
    const messages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => {
      renderer = create(
        <MessageList {...listProps(messages)} bottomAccessoryHeight={mockCreateSharedValue(88)} />,
      );
    });

    expect(mockScrollButtonProps?.isAtBottom).toBe(true);

    const buttonVisibilityReaction = mockAnimatedReactions[0];
    const isAtEnd = mockLatestListProps?.sharedValues?.isAtEnd;
    isAtEnd?.set(false);
    act(() => buttonVisibilityReaction.react(buttonVisibilityReaction.prepare(), true));
    expect(mockScrollButtonProps?.isAtBottom).toBe(false);

    act(() => mockScrollButtonProps?.onPress());
    expect(mockListScrollToEndMethod).toHaveBeenLastCalledWith({ animated: true });

    isAtEnd?.set(true);
    act(() => buttonVisibilityReaction.react(buttonVisibilityReaction.prepare(), false));
    expect(mockScrollButtonProps?.isAtBottom).toBe(true);

    // 点击只滚动一次；后续 chunk 再把列表推离底部时，按钮重新出现而不会恢复跟随。
    isAtEnd?.set(false);
    act(() => buttonVisibilityReaction.react(buttonVisibilityReaction.prepare(), true));
    expect(mockScrollButtonProps?.isAtBottom).toBe(false);
    expect(mockListScrollToEndMethod).toHaveBeenCalledTimes(1);
  });

  test('keeps position restoration enabled across prepend and new turns', () => {
    const messages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });

    const prepended = [createMessage('older-1', 'assistant'), ...messages];
    act(() => renderer?.update(<MessageList {...listProps(prepended)} />));
    expect(mockLatestListProps?.maintainVisibleContentPosition).toMatchObject({ data: true });

    const nextTurn = [
      ...prepended,
      createMessage('user-2', 'user', [textPart('next')]),
      createMessage('assistant-2', 'assistant'),
    ];
    act(() => renderer?.update(<MessageList {...listProps(nextTurn)} />));
    expect(mockLatestListProps?.maintainVisibleContentPosition).toMatchObject({ data: true });
  });

  test('pins each live anchor once and coordinates keyboard dismissal', () => {
    const firstTurn = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => {
      renderer = create(<MessageList {...listProps(firstTurn, 'user-1')} />);
    });
    act(() => mockLatestListProps?.anchoredEndSpace?.onReady?.({ anchorKey: 'user-1' }));
    act(() => mockLatestListProps?.anchoredEndSpace?.onReady?.({ anchorKey: 'user-1' }));
    act(() => flushAnimationFrames());

    expect(mockScrollMessageToEnd).toHaveBeenCalledTimes(1);
    expect(mockScrollMessageToEnd).toHaveBeenLastCalledWith({
      animated: true,
      closeKeyboard: true,
    });
    expect(mockLatestListProps?.freeze).toBe(mockFreeze);

    const secondTurn = [
      ...firstTurn,
      createMessage('user-2', 'user', [textPart('next')]),
      createMessage('assistant-2', 'assistant'),
    ];
    act(() => renderer?.update(<MessageList {...listProps(secondTurn, 'user-2')} />));
    act(() => mockLatestListProps?.anchoredEndSpace?.onReady?.({ anchorKey: 'user-2' }));
    act(() => flushAnimationFrames());

    // 钉顶滚动始终带动画：它搬的是旧内容，瞬时会让整屏一帧切掉。与行的 transform 不叠加成
    // 双倍——弹簧只走「总行程减去这次滚动」那一段。
    expect(mockScrollMessageToEnd).toHaveBeenLastCalledWith({
      animated: true,
      closeKeyboard: true,
    });

    const historicalTurn = [
      ...secondTurn,
      createMessage('user-3', 'user', [textPart('history')]),
      createMessage('assistant-3', 'assistant'),
    ];
    act(() => renderer?.update(<MessageList {...listProps(historicalTurn)} />));
    act(() => mockLatestListProps?.anchoredEndSpace?.onReady?.({ anchorKey: 'user-3' }));
    act(() => flushAnimationFrames());

    expect(mockScrollMessageToEnd).toHaveBeenLastCalledWith({
      animated: true,
      closeKeyboard: false,
    });
  });

  test('arms the entering row at the composer edge and launches it when the anchor lands', () => {
    act(() => {
      renderer = create(<MessageList {...listProps([])} />);
    });
    act(() => {
      mockLatestListProps?.onLayout?.({
        nativeEvent: { layout: { height: 600, width: 390, x: 0, y: 0 } },
      } as LayoutChangeEvent);
    });
    act(() => {
      renderer?.update(
        <MessageList
          {...listProps([createMessage('user-1', 'user', [textPart('hi')])], 'user-1')}
        />,
      );
    });

    // 起飞距离＝视口 600 −（输入框占位 80）−（顶部 inset 44 + 落点间距 12）。全是运行时布局
    // 值，换机型/字号/输入框行数都会跟着变，代码里没有任何写死的距离。
    expect(mockSlideInFlight?.offset.get()).toBe(464);

    // 钉顶落位前不许收敛：那段时间要等测量与 ready-gate 的静默窗口，行得一直待在起飞点。
    act(() => flushAnimationFrames());
    expect(mockSlideInFlight?.offset.get()).toBe(464);

    act(() => mockLatestListProps?.anchoredEndSpace?.onReady?.({ anchorKey: 'user-1' }));
    act(() => flushAnimationFrames());

    expect(mockSlideInFlight?.offset.get()).toBe(0);
  });

  test('lets the pin scroll carry its share of the travel instead of the spring taking all of it', () => {
    act(() => {
      renderer = create(<MessageList {...listProps([])} />);
    });
    act(() => {
      mockLatestListProps?.onLayout?.({
        nativeEvent: { layout: { height: 600, width: 390, x: 0, y: 0 } },
      } as LayoutChangeEvent);
    });
    act(() => {
      renderer?.update(
        <MessageList
          {...listProps([createMessage('user-1', 'user', [textPart('hi')])], 'user-1')}
        />,
      );
    });
    // 已有话题：内容比视口长，钉顶要先把旧内容滚出视口。待滚的量取自列表自报的几何
    // （内容 900 − 视口 600 − 当前位移 0 = 300），而不是组件里那几个会滞后的 React state。
    mockListMetrics = { contentLength: 900, scroll: 0, scrollLength: 600 };
    expect(mockSlideInFlight?.offset.get()).toBe(464);

    // 弹簧被 mock 成直接落到终值，所以要看开火那一刻写进去的**起点**，不是终值。
    const offset = mockSlideInFlight?.offset;
    const setSpy = jest.fn();
    const passThrough = offset?.set.bind(offset);
    if (offset && passThrough) {
      offset.set = (value: Parameters<typeof passThrough>[0]) => {
        setSpy(value);
        passThrough(value);
      };
    }

    act(() => mockLatestListProps?.anchoredEndSpace?.onReady?.({ anchorKey: 'user-1' }));
    act(() => flushAnimationFrames());

    // 滚动分走 300、弹簧只走 164，两段相加仍是 464——行的可见总路程与新话题里一模一样。
    expect(setSpy.mock.calls.map(([value]) => value)).toEqual([164, 0]);
    expect(mockScrollMessageToEnd).toHaveBeenLastCalledWith({
      animated: true,
      closeKeyboard: true,
    });
  });

  test('holds the entering turn assistant row back until the user row has landed', () => {
    act(() => {
      renderer = create(<MessageList {...listProps([])} />);
    });
    act(() => {
      mockLatestListProps?.onLayout?.({
        nativeEvent: { layout: { height: 600, width: 390, x: 0, y: 0 } },
      } as LayoutChangeEvent);
    });
    const turn = [
      createMessage('user-1', 'user', [textPart('hi')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => renderer?.update(<MessageList {...listProps(turn, 'user-1')} />));

    // 跟随的是「待发消息的下一条」，不是笼统的最后一行——流式期间最后一行还是它，但那时
    // 飞行早已结束，不该再被 opacity 碰。
    expect(mockSlideInFlight?.followerMessageId.get()).toBe('assistant-1');
    expect(mockSlideInFlight?.landingProgress.get()).toBe(0);

    act(() => mockLatestListProps?.anchoredEndSpace?.onReady?.({ anchorKey: 'user-1' }));
    act(() => flushAnimationFrames());

    expect(mockSlideInFlight?.landingProgress.get()).toBe(1);
  });

  test('still launches the entering row after the pending message has been cleared', () => {
    act(() => {
      renderer = create(<MessageList {...listProps([])} />);
    });
    act(() => {
      mockLatestListProps?.onLayout?.({
        nativeEvent: { layout: { height: 600, width: 390, x: 0, y: 0 } },
      } as LayoutChangeEvent);
    });
    const messages = [createMessage('user-1', 'user', [textPart('hi')])];
    act(() => renderer?.update(<MessageList {...listProps(messages, 'user-1')} />));
    expect(mockSlideInFlight?.offset.get()).toBe(464);

    // 消息落库 → enteringMessageId 被清空，而这常常发生在飞行中途、钉顶落位之前。
    act(() => renderer?.update(<MessageList {...listProps(messages)} />));
    act(() => mockLatestListProps?.anchoredEndSpace?.onReady?.({ anchorKey: 'user-1' }));
    act(() => flushAnimationFrames());

    // 开火只看「装填了没有」，所以行照样收敛而不是永久停在半空。
    expect(mockSlideInFlight?.offset.get()).toBe(0);
  });

  test('gives a brand-new topic the anchor space right away instead of staging it', () => {
    // 首锚曾经先在列表末端 staging、再补空白动画过去，为的是给「没有可滚动距离」的第一条
    // 制造一段位移。位移改由行的 transform 提供之后这套 staging 没有存在理由了，第一条从
    // 一开始就拿到与续轮完全相同的锚点配置。
    const firstTurn = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => {
      renderer = create(<MessageList {...listProps([])} />);
    });
    act(() => {
      renderer?.update(<MessageList {...listProps(firstTurn, 'user-1')} />);
    });

    expect(mockLatestListProps?.anchoredEndSpace?.anchorIndex).toBe(0);
    expect(mockLatestListProps?.alignItemsAtEnd).toBeUndefined();

    act(() => mockLatestListProps?.anchoredEndSpace?.onReady?.({ anchorKey: 'user-1' }));
    act(() => flushAnimationFrames());

    expect(mockScrollMessageToEnd).toHaveBeenCalledWith({
      animated: true,
      closeKeyboard: true,
    });
  });
});

import type { Message } from '@cherrystudio/universal/data/types/message';
import type { LegendListRef } from '@legendapp/list/react-native';
import type { ReactNode, Ref } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListProps, MessagePresentationItem } from '../../types';
import { MessageList } from '../MessageList';
import { followingMaintainVisibleContentPosition as androidFollowingPosition } from '../messageListPlatform/messageListPlatform.android';
import { followingMaintainVisibleContentPosition as iosFollowingPosition } from '../messageListPlatform/messageListPlatform.ios';

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
  data?: readonly MessagePresentationItem[];
  freeze?: unknown;
  getItemType?: (item: MessagePresentationItem) => string;
  keyboardLiftBehavior?: string;
  keyboardOffset?: number;
  maintainScrollAtEnd?: unknown;
  maintainScrollAtEndThreshold?: number;
  maintainVisibleContentPosition?: unknown;
  onEndVisible?: (visible: boolean) => void;
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
  renderItem?: (info: { index: number; item: MessagePresentationItem }) => ReactNode;
  sharedValues?: { isAtEnd: SharedValue<boolean> };
  showsVerticalScrollIndicator?: boolean;
};

let mockLatestListProps: MockLegendListProps | undefined;
const mockFreeze = { get: jest.fn(), set: jest.fn(), value: false };
const mockScrollMessageToEnd = jest.fn(async () => undefined);
const mockListScrollToEnd = jest.fn();
const mockListScrollToEndMethod = jest.fn(async () => undefined);
let mockListMetrics = { contentLength: 500, scroll: 0, scrollLength: 500 };
const mockLegendListRef = {
  getNativeScrollRef: () => ({ scrollToEnd: mockListScrollToEnd }),
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
const mockAssistantMessageRow = jest.fn((_props: { message: MessagePresentationItem }) => null);
const mockUserMessageRow = jest.fn((_props: { message: MessagePresentationItem }) => null);
let mockSlideInMessageId: string | undefined;
let mockScrollButtonProps:
  | {
      inputHeight: SharedValue<number>;
      isHidden: SharedValue<boolean>;
      onPress: () => void;
    }
  | undefined;
let mockFontSizeStep = 0;
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
  ScrollShadow: ({ children }: { children: ReactNode }) => children,
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
    // 探针用 useAnimatedReaction 从 UI 线程回抛按钮显隐；这里只需存在即可，
    // 本套件不断言探针输出。
    runOnJS: (fn: unknown) => fn,
    useAnimatedReaction: () => undefined,
    // 真实求值，好让「按钮显隐」的推导语义可断言。
    useDerivedValue: (compute: () => unknown) => ({ get: compute }),
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

jest.mock('../../messageRow', () => ({
  AssistantMessageRow: (props: { message: MessagePresentationItem }) =>
    mockAssistantMessageRow(props),
  MessageSlideInProvider: ({
    children,
    slideInMessageId,
  }: {
    children: ReactNode;
    slideInMessageId?: string;
  }) => {
    mockSlideInMessageId = slideInMessageId;
    return children;
  },
  UserMessageRow: (props: { message: MessagePresentationItem }) => mockUserMessageRow(props),
}));

jest.mock('../ScrollToBottomButton', () => ({
  ScrollToBottomButton: (props: {
    inputHeight: SharedValue<number>;
    isHidden: SharedValue<boolean>;
    onPress: () => void;
  }) => {
    mockScrollButtonProps = props;
    return null;
  },
}));

function createMessage(
  id: string,
  role: MessagePresentationItem['role'],
  parts: Message['data']['parts'] = [],
): MessagePresentationItem {
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
  messages: readonly MessagePresentationItem[],
  enteringMessageId?: string,
): MessageListProps {
  return {
    contentBottomInset: 80,
    contentTopInset: 44,
    ...(enteringMessageId ? { enteringMessageId } : {}),
    keyboardOffset: 26,
    messages,
    onLoadOlder: jest.fn(async () => undefined),
  };
}

describe('MessageList anchored tail following', () => {
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
    mockFontSizeStep = 0;
    mockLatestListProps = undefined;
    mockScrollButtonProps = undefined;
    mockSlideInMessageId = undefined;
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

  test('uses an assistant renderer override without changing user rows', () => {
    const user = createMessage('user-1', 'user', [textPart('hello')]);
    const assistant = createMessage('assistant-1', 'assistant');
    const renderAssistantMessage = jest.fn(() => null);

    act(() => {
      renderer = create(
        <MessageList
          {...listProps([user, assistant])}
          renderAssistantMessage={renderAssistantMessage}
        />,
      );
    });

    expect(mockUserMessageRow).toHaveBeenCalledWith({ message: user });
    expect(renderAssistantMessage).toHaveBeenCalledWith(assistant);
    expect(mockAssistantMessageRow).not.toHaveBeenCalled();
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

    expect(mockUserMessageRow).toHaveBeenCalledWith({ message: userMessage });
    expect(mockAssistantMessageRow).toHaveBeenCalledWith({ message: emptyAssistantMessage });
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

    expect(mockSlideInMessageId).toBe('user-1');
    expect(mockScrollButtonProps?.inputHeight).toBe(bottomAccessoryHeight);

    // 停在底部时隐藏。离开底部要不要显示还取决于相位，见下方的 paused 用例。
    const isAtEnd = mockLatestListProps?.sharedValues?.isAtEnd;
    isAtEnd?.set(true);
    expect(mockScrollButtonProps?.isHidden.get()).toBe(true);

    act(() => mockScrollButtonProps?.onPress());
    expect(mockListScrollToEndMethod).toHaveBeenCalledWith({ animated: true });

    mockScrollButtonProps = undefined;
    act(() => renderer?.update(<MessageList {...listProps(props.messages)} />));

    expect(mockScrollButtonProps).toBeUndefined();
    expect(mockSlideInMessageId).toBeUndefined();
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

  test('follows after overflow, pauses on drag, and resumes only at the end', () => {
    const messages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });

    expect(mockLatestListProps?.maintainScrollAtEnd).toBeUndefined();
    expect(mockLatestListProps?.maintainVisibleContentPosition).toMatchObject({ data: true });

    act(() => mockLatestListProps?.anchoredEndSpace?.onSizeChanged?.(0));
    act(() => flushAnimationFrames());
    expect(mockListScrollToEnd).toHaveBeenCalledTimes(1);
    expect(mockLatestListProps?.maintainVisibleContentPosition).toBeUndefined();

    act(() => {
      mockLatestListProps?.onTouchStart?.();
      mockLatestListProps?.onScrollBeginDrag?.();
    });
    expect(mockLatestListProps?.maintainVisibleContentPosition).toMatchObject({ data: true });

    act(() =>
      mockLatestListProps?.onItemSizeChanged?.({
        index: 1,
        itemKey: 'assistant-1',
        previous: 120,
        size: 180,
      }),
    );
    act(() => flushAnimationFrames());
    expect(mockListScrollToEnd).toHaveBeenCalledTimes(1);

    mockListMetrics = { contentLength: 1_500, scroll: 200, scrollLength: 500 };
    act(() => {
      mockLatestListProps?.onEndVisible?.(true);
      mockLatestListProps?.onTouchEnd?.();
      mockLatestListProps?.onScrollEndDrag?.();
      flushAnimationFrames();
    });
    expect(mockLatestListProps?.maintainVisibleContentPosition).toMatchObject({ data: true });

    mockListMetrics = { contentLength: 1_500, scroll: 1_000, scrollLength: 500 };
    act(() => {
      mockLatestListProps?.onEndVisible?.(true);
      flushAnimationFrames();
    });
    expect(mockLatestListProps?.maintainVisibleContentPosition).toBeUndefined();
    expect(mockListScrollToEnd).toHaveBeenCalledTimes(2);
  });

  test('shows the scroll control only once the user pauses tail following', () => {
    const messages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => {
      renderer = create(
        <MessageList {...listProps(messages)} bottomAccessoryHeight={mockCreateSharedValue(88)} />,
      );
    });

    // 钉顶期与尾随期都由 app 主动把列表推向底部：内容每长一截都会先把视口挤离底部、
    // 下一帧滚动再吸回来，isAtEnd 因此逐帧翻转。这两个相位必须一律隐藏，否则按钮脉动。
    const isAtEnd = mockLatestListProps?.sharedValues?.isAtEnd;
    isAtEnd?.set(false);
    expect(mockScrollButtonProps?.isHidden.get()).toBe(true);

    act(() => mockLatestListProps?.anchoredEndSpace?.onSizeChanged?.(0));
    act(() => flushAnimationFrames());
    isAtEnd?.set(false);
    expect(mockScrollButtonProps?.isHidden.get()).toBe(true);

    // 用户拖动打断尾随后不再有自动滚动，此时离开底部才是真的「用户自己走开了」。
    act(() => mockLatestListProps?.onScrollBeginDrag?.());
    expect(mockScrollButtonProps?.isHidden.get()).toBe(false);

    isAtEnd?.set(true);
    expect(mockScrollButtonProps?.isHidden.get()).toBe(true);
  });

  test('cancels a queued follow before a touch can begin dragging', () => {
    const messages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    act(() => mockLatestListProps?.anchoredEndSpace?.onSizeChanged?.(0));

    const escapedFollowCallback = [...frameCallbacks.values()][0];
    expect(escapedFollowCallback).toBeDefined();

    act(() => mockLatestListProps?.onTouchStart?.());
    expect(frameCallbacks.size).toBe(0);

    act(() => escapedFollowCallback?.(0));
    expect(mockListScrollToEnd).not.toHaveBeenCalled();
  });

  test('does not resume while momentum is active', () => {
    const messages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    act(() => mockLatestListProps?.anchoredEndSpace?.onSizeChanged?.(0));
    act(() => flushAnimationFrames());

    act(() => {
      mockLatestListProps?.onTouchStart?.();
      mockLatestListProps?.onScrollBeginDrag?.();
      mockLatestListProps?.onMomentumScrollBegin?.();
      mockLatestListProps?.onTouchEnd?.();
      mockLatestListProps?.onScrollEndDrag?.();
      mockLatestListProps?.onEndVisible?.(true);
      flushAnimationFrames();
    });
    expect(mockLatestListProps?.maintainVisibleContentPosition).toMatchObject({ data: true });
    expect(mockListScrollToEnd).toHaveBeenCalledTimes(1);

    act(() => {
      mockLatestListProps?.onMomentumScrollEnd?.();
      flushAnimationFrames();
      flushAnimationFrames();
    });
    expect(mockLatestListProps?.maintainVisibleContentPosition).toBeUndefined();
    expect(mockListScrollToEnd).toHaveBeenCalledTimes(2);
  });

  test('defines the platform MVCP behavior used while following', () => {
    expect(iosFollowingPosition).toBeUndefined();
    expect(androidFollowingPosition).toBe(false);
  });

  test('preserves follow state across prepend and resets it for a new anchor id', () => {
    const messages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    act(() => mockLatestListProps?.anchoredEndSpace?.onSizeChanged?.(0));

    const prepended = [createMessage('older-1', 'assistant'), ...messages];
    act(() => renderer?.update(<MessageList {...listProps(prepended)} />));
    expect(mockLatestListProps?.maintainVisibleContentPosition).toBeUndefined();

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
      animated: false,
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
      animated: false,
      closeKeyboard: false,
    });
  });

  test('stages the first live turn at the list end before animating it to the anchor', () => {
    const firstTurn = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => {
      renderer = create(<MessageList {...listProps([])} animateFirstEnteringMessage />);
    });
    act(() => {
      renderer?.update(
        <MessageList {...listProps(firstTurn, 'user-1')} animateFirstEnteringMessage />,
      );
    });

    expect(mockLatestListProps?.anchoredEndSpace).toBeUndefined();
    expect(mockLatestListProps?.alignItemsAtEnd).toBe(true);

    act(() => mockLatestListProps?.onContentSizeChange?.(320, 260));
    act(() => flushAnimationFrames());

    expect(mockLatestListProps?.anchoredEndSpace?.anchorIndex).toBe(0);
    expect(mockLatestListProps?.alignItemsAtEnd).toBe(false);
    act(() => mockLatestListProps?.anchoredEndSpace?.onReady?.({ anchorKey: 'user-1' }));
    act(() => flushAnimationFrames());

    expect(mockScrollMessageToEnd).toHaveBeenCalledWith({
      animated: true,
      closeKeyboard: true,
    });
  });
});

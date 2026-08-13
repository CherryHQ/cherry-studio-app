import type { Message } from '@cherrystudio/universal/data/types/message';
import type { LegendListRef } from '@legendapp/list/react-native';
import type { ReactNode, Ref } from 'react';
import { type LayoutChangeEvent, Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListProps, MessagePresentationItem } from '../../types';
import { MessageList } from '../MessageList';

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
  keyboardOffset?: number;
  maintainScrollAtEnd?: unknown;
  maintainScrollAtEndThreshold?: number;
  maintainVisibleContentPosition?: unknown;
  onEndVisible?: (visible: boolean) => void;
  onContentSizeChange?: (width: number, height: number) => void;
  onItemSizeChanged?: () => void;
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
const mockIsAtBottom = {
  get: jest.fn(() => true),
  set: jest.fn(),
  value: true,
} as unknown as SharedValue<boolean>;
const mockAssistantMessageRow = jest.fn((_props: { message: MessagePresentationItem }) => null);
const mockUserMessageRow = jest.fn((_props: { message: MessagePresentationItem }) => null);
let mockSlideInMessageId: string | undefined;
let mockScrollButtonProps:
  | {
      inputHeight: SharedValue<number>;
      isAtBottom: SharedValue<boolean>;
      onPress: () => void;
    }
  | undefined;
let mockFontSizeStep = 0;
const originalPlatform = Platform.OS;

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

jest.mock('react-native-reanimated', () => ({
  useSharedValue: () => mockIsAtBottom,
}));

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
    isAtBottom: SharedValue<boolean>;
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
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
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
    const pendingAssistantMessage = createMessage('assistant-1', 'assistant');

    act(() => {
      renderer = create(<MessageList {...listProps([userMessage, pendingAssistantMessage])} />);
    });

    expect(mockUserMessageRow).toHaveBeenCalledWith({ message: userMessage });
    expect(mockAssistantMessageRow).toHaveBeenCalledWith({ message: pendingAssistantMessage });
    expect(mockLatestListProps?.getItemType?.(userMessage)).toBe('user');
    expect(mockLatestListProps?.getItemType?.(pendingAssistantMessage)).toBe('assistant');
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
    expect(mockScrollButtonProps?.isAtBottom).toBe(mockLatestListProps?.sharedValues?.isAtEnd);

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
    expect(mockLatestListProps?.showsVerticalScrollIndicator).toBe(false);
    expect(mockLatestListProps?.contentContainerStyle).toEqual({
      paddingBottom: 80,
      paddingTop: 12,
    });
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

    act(() => mockLatestListProps?.onItemSizeChanged?.());
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

  test.each([
    ['ios', undefined],
    ['android', false],
  ] as const)('uses the %s MVCP behavior while following', (platform, expected) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    const messages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });

    expect(mockLatestListProps?.maintainVisibleContentPosition).toMatchObject({ data: true });
    act(() => mockLatestListProps?.anchoredEndSpace?.onSizeChanged?.(0));
    expect(mockLatestListProps?.maintainVisibleContentPosition).toBe(expected);
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

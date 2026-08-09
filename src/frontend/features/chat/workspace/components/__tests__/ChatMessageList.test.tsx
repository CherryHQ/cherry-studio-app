import type { Message } from '@cherrystudio/universal/data/types/message';
import type { LegendListRef } from '@legendapp/list/react-native';
import type { ReactNode } from 'react';
import { type LayoutChangeEvent, Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatMessageList } from '../ChatMessageList';

type AnchoredEndSpaceConfig = {
  anchorMaxSize?: number;
  onReady?: (info: { anchorKey: string | undefined }) => void;
  onSizeChanged?: (size: number) => void;
};

type MockLegendListProps = {
  applyWorkaroundForContentInsetHitTestBug?: boolean;
  anchoredEndSpace?: AnchoredEndSpaceConfig;
  contentContainerStyle?: { paddingBottom?: number; paddingTop?: number };
  freeze?: unknown;
  keyboardOffset?: number;
  maintainScrollAtEnd?: unknown;
  maintainScrollAtEndThreshold?: number;
  maintainVisibleContentPosition?: unknown;
  onEndVisible?: (visible: boolean) => void;
  onItemSizeChanged?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onMomentumScrollBegin?: () => void;
  onMomentumScrollEnd?: () => void;
  onScrollBeginDrag?: () => void;
  onScrollEndDrag?: () => void;
  onTouchEnd?: () => void;
  onTouchStart?: () => void;
};

let mockLatestListProps: MockLegendListProps | undefined;
const mockFreeze = { get: jest.fn(), set: jest.fn(), value: false };
const mockScrollMessageToEnd = jest.fn(async () => undefined);
const mockListScrollToEnd = jest.fn();
let mockListMetrics = { contentLength: 500, scroll: 0, scrollLength: 500 };
const listRef = {
  current: {
    getNativeScrollRef: () => ({ scrollToEnd: mockListScrollToEnd }),
    getState: () => mockListMetrics,
  } as unknown as LegendListRef,
};
let mockFontSizeStep = 0;
const originalPlatform = Platform.OS;

jest.mock('@legendapp/list/keyboard', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    KeyboardAwareLegendList: (props: MockLegendListProps) => {
      mockLatestListProps = props;
      return <MockView testID="chat-message-list" />;
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

jest.mock('../../../messageItem', () => ({
  AssistantMessageItem: () => null,
  UserMessageItem: () => null,
}));

const now = '2026-08-06T00:00:00.000Z';

function createMessage(
  id: string,
  role: Message['role'],
  parts: Message['data']['parts'] = [],
): Message {
  return {
    createdAt: now,
    data: { parts },
    id,
    parentId: null,
    role,
    searchableText: '',
    siblingsGroupId: 0,
    status: role === 'assistant' ? 'pending' : 'success',
    topicId: 'topic-1',
    updatedAt: now,
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

const isAtBottom = {
  get: () => true,
  set: jest.fn(),
  value: true,
} as unknown as SharedValue<boolean>;

function listProps(
  messages: readonly Message[],
  anchorIndex: number,
  pendingUserMessageId?: string,
) {
  return {
    anchorIndex,
    contentBottomInset: 80,
    contentTopInset: 44,
    isAtBottom,
    keyboardOffset: 26,
    listRef,
    messages,
    onLoadOlder: jest.fn(async () => undefined),
    onPrefetchOlder: jest.fn(),
    pendingUserMessageId,
  };
}

describe('ChatMessageList anchored tail following', () => {
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
      renderer = create(<ChatMessageList {...listProps(textMessages, 0)} />);
    });

    expect(mockLatestListProps?.anchoredEndSpace?.anchorMaxSize).toBe(80);

    mockFontSizeStep = 2;
    act(() => renderer?.update(<ChatMessageList {...listProps(textMessages, 0)} />));
    expect(mockLatestListProps?.anchoredEndSpace?.anchorMaxSize).toBe(84);

    const fileMessages = [
      createMessage('user-1', 'user', [filePart()]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => renderer?.update(<ChatMessageList {...listProps(fileMessages, 0)} />));

    expect(mockLatestListProps?.anchoredEndSpace?.anchorMaxSize).toBeUndefined();
  });

  test('reserves the composer height in the scrollable message content', () => {
    const messages = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];

    act(() => {
      renderer = create(<ChatMessageList {...listProps(messages, 0)} />);
    });

    expect(mockLatestListProps?.applyWorkaroundForContentInsetHitTestBug).toBe(true);

    act(() => {
      mockLatestListProps?.onLayout?.({
        nativeEvent: { layout: { height: 600, width: 390, x: 0, y: 0 } },
      } as LayoutChangeEvent);
    });

    expect(mockLatestListProps?.keyboardOffset).toBe(26);
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
      renderer = create(<ChatMessageList {...listProps(messages, 0)} />);
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
      renderer = create(<ChatMessageList {...listProps(messages, 0)} />);
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
      renderer = create(<ChatMessageList {...listProps(messages, 0)} />);
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
      renderer = create(<ChatMessageList {...listProps(messages, 0)} />);
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
      renderer = create(<ChatMessageList {...listProps(messages, 0)} />);
    });
    act(() => mockLatestListProps?.anchoredEndSpace?.onSizeChanged?.(0));

    const prepended = [createMessage('older-1', 'assistant'), ...messages];
    act(() => renderer?.update(<ChatMessageList {...listProps(prepended, 1)} />));
    expect(mockLatestListProps?.maintainVisibleContentPosition).toBeUndefined();

    const nextTurn = [
      ...prepended,
      createMessage('user-2', 'user', [textPart('next')]),
      createMessage('assistant-2', 'assistant'),
    ];
    act(() => renderer?.update(<ChatMessageList {...listProps(nextTurn, 3)} />));
    expect(mockLatestListProps?.maintainVisibleContentPosition).toMatchObject({ data: true });
  });

  test('pins each live anchor once and coordinates keyboard dismissal', () => {
    const firstTurn = [
      createMessage('user-1', 'user', [textPart('hello')]),
      createMessage('assistant-1', 'assistant'),
    ];
    act(() => {
      renderer = create(<ChatMessageList {...listProps(firstTurn, 0, 'user-1')} />);
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
    act(() => renderer?.update(<ChatMessageList {...listProps(secondTurn, 2, 'user-2')} />));
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
    act(() => renderer?.update(<ChatMessageList {...listProps(historicalTurn, 4)} />));
    act(() => mockLatestListProps?.anchoredEndSpace?.onReady?.({ anchorKey: 'user-3' }));
    act(() => flushAnimationFrames());

    expect(mockScrollMessageToEnd).toHaveBeenLastCalledWith({
      animated: false,
      closeKeyboard: false,
    });
  });
});

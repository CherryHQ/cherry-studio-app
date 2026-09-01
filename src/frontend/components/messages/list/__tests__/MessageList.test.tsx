import type { LegendListRef } from '@legendapp/list/react-native';
import type { ReactNode, Ref } from 'react';
import { Platform, type LayoutChangeEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cacheService } from '@/frontend/data/CacheService';

import { MessageList } from '../../MessageList';
import type { MessageListItem, MessageListProps } from '../../types';

jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

type MockLegendListProps = {
  anchoredEndSpace?: unknown;
  applyWorkaroundForContentInsetHitTestBug?: boolean;
  contentContainerStyle?: { paddingBottom?: number; paddingTop?: number };
  data?: readonly MessageListItem[];
  dataKey?: string;
  extraData?: unknown;
  freeze?: unknown;
  getItemType?: (item: MessageListItem) => string;
  initialScrollAtEnd?: boolean;
  keyboardDismissMode?: string;
  keyboardLiftBehavior?: string;
  keyboardOffset?: number;
  maintainScrollAtEnd?: unknown;
  maintainVisibleContentPosition?: unknown;
  onContentSizeChange?: (width: number, height: number) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onLoad?: () => void;
  onMomentumScrollBegin?: () => void;
  onMomentumScrollEnd?: () => void;
  onScroll?: (event: never) => void;
  onScrollBeginDrag?: () => void;
  onScrollEndDrag?: () => void;
  onStartReached?: () => void;
  onTouchStart?: () => void;
  recycleItems?: boolean;
  ref?: Ref<LegendListRef>;
  renderItem?: (info: { index: number; item: MessageListItem }) => ReactNode;
  sharedValues?: { isAtEnd: SharedValue<boolean> };
  showsVerticalScrollIndicator?: boolean;
};

let mockLatestListProps: MockLegendListProps | undefined;
const mockFreeze = { get: jest.fn(), set: jest.fn(), value: false };
const mockScrollMessageToEnd = jest.fn(async () => undefined);
const mockListScrollToEnd = jest.fn(async () => undefined);
const mockListScrollToIndex = jest.fn(async () => undefined);
let mockListState = {
  contentLength: 900,
  isAtEnd: true,
  positionAtIndex: (index: number) => index * 200,
  scroll: 500,
  scrollLength: 400,
  start: 2,
};
const mockLegendListRef = {
  getState: () => mockListState,
  scrollToEnd: mockListScrollToEnd,
  scrollToIndex: mockListScrollToIndex,
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

let mockScrollButtonProps:
  | {
      bottomAccessoryHeight?: SharedValue<number>;
      isAtBottom: boolean;
      onPress: () => void;
    }
  | undefined;
type MockAnimatedReaction = {
  prepare: () => unknown;
  react: (current: unknown, previous: unknown) => void;
};
let mockAnimatedReactions: MockAnimatedReaction[] = [];

jest.mock('@legendapp/list/keyboard', () => {
  const { Fragment } = jest.requireActual('react');
  const { useLayoutEffect } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    KeyboardAwareLegendList: (props: MockLegendListProps) => {
      mockLatestListProps = props;
      const listRef = props.ref;
      useLayoutEffect(() => {
        if (typeof listRef === 'function') {
          listRef(mockLegendListRef);
        } else if (listRef) {
          listRef.current = mockLegendListRef;
        }
        return () => {
          if (typeof listRef === 'function') {
            listRef(null);
          } else if (listRef) {
            listRef.current = null;
          }
        };
      }, [listRef]);

      return (
        <View testID="message-list">
          {props.data?.map((item, index) => (
            <Fragment key={item.id}>{props.renderItem?.({ index, item })}</Fragment>
          ))}
        </View>
      );
    },
    useKeyboardScrollToEnd: () => ({
      freeze: mockFreeze,
      scrollMessageToEnd: mockScrollMessageToEnd,
    }),
  };
});

jest.mock('@cherrystudio/ui/components', () => ({
  ContextMenuScrollBoundary: ({
    children,
    ...handlers
  }: {
    children: (handlers: Record<string, unknown>) => ReactNode;
  }) => children(handlers),
  ScrollToBottomButton: (props: {
    bottomAccessoryHeight?: SharedValue<number>;
    isAtBottom: boolean;
    onPress: () => void;
  }) => {
    mockScrollButtonProps = props;
    return null;
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => `translated:${key}` }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ debug: jest.fn() }),
  },
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
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
    useSharedValue: <T,>(initial: T) => {
      const ref = React.useRef<SharedValue<T> | null>(null);
      ref.current ??= mockCreateSharedValue(initial);
      return ref.current;
    },
  };
});

const mockRenderMessage = jest.fn((_message: MessageListItem) => null);

function createMessage(id: string, role: MessageListItem['role']): MessageListItem {
  return {
    data: { parts: [{ text: id, type: 'text' }] },
    id,
    role,
    status: role === 'assistant' ? 'pending' : 'success',
  };
}

function listProps(
  messages: readonly MessageListItem[],
  overrides: Partial<MessageListProps> = {},
): MessageListProps {
  return {
    contentBottomInset: 80,
    contentTopInset: 44,
    dataKey: 'session-1',
    keyboardOffset: 26,
    messages,
    onLoadOlder: jest.fn(async () => undefined),
    renderMessage: mockRenderMessage,
    ...overrides,
  };
}

describe('MessageList scroll-controller ownership', () => {
  let renderer: ReactTestRenderer | undefined;
  let frameCallbacks: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let requestAnimationFrameSpy: jest.SpyInstance;
  let cancelAnimationFrameSpy: jest.SpyInstance;
  let dateNowSpy: jest.SpyInstance | undefined;

  const flushAnimationFrames = () => {
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    callbacks.forEach((callback) => callback(0));
  };

  const loadList = async () => {
    await act(async () => {
      mockLatestListProps?.onLoad?.();
      await Promise.resolve();
    });
    act(flushAnimationFrames);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.set('chat.scroll_anchor.session-1', null);
    mockAnimatedReactions = [];
    mockLatestListProps = undefined;
    mockScrollButtonProps = undefined;
    mockListState = {
      contentLength: 900,
      isAtEnd: true,
      positionAtIndex: (index: number) => index * 200,
      scroll: 500,
      scrollLength: 400,
      start: 2,
    };
    frameCallbacks = new Map();
    nextFrameId = 1;
    requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        const id = nextFrameId++;
        frameCallbacks.set(id, callback);
        return id;
      });
    cancelAnimationFrameSpy = jest
      .spyOn(global, 'cancelAnimationFrame')
      .mockImplementation((id) => {
        if (id != null) {
          frameCallbacks.delete(id);
        }
      });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    dateNowSpy?.mockRestore();
    dateNowSpy = undefined;
    cancelAnimationFrameSpy.mockRestore();
    requestAnimationFrameSpy.mockRestore();
  });

  test('uses one runtime without competing initial, anchor, or maintain-end writers', async () => {
    const messages = [createMessage('user-1', 'user'), createMessage('assistant-1', 'assistant')];
    const onReady = jest.fn();
    act(() => {
      renderer = create(<MessageList {...listProps(messages, { onReady })} />);
    });

    expect(mockLatestListProps).toMatchObject({
      dataKey: 'session-1',
      keyboardLiftBehavior: 'whenAtEnd',
      maintainVisibleContentPosition: { data: true },
      recycleItems: false,
    });
    expect(mockLatestListProps?.anchoredEndSpace).toBeUndefined();
    expect(mockLatestListProps?.initialScrollAtEnd).toBeUndefined();
    expect(mockLatestListProps?.maintainScrollAtEnd).toBeUndefined();

    await loadList();

    expect(mockListScrollToEnd).toHaveBeenCalledTimes(1);
    expect(mockListScrollToEnd).toHaveBeenCalledWith({ animated: false });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test('waits for history readiness before restoring the viewport', async () => {
    const messages = [createMessage('user-1', 'user')];
    act(() => {
      renderer = create(<MessageList {...listProps(messages, { initialLayoutReady: false })} />);
    });
    await loadList();
    expect(mockListScrollToEnd).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.update(<MessageList {...listProps(messages, { initialLayoutReady: true })} />);
      await Promise.resolve();
    });
    act(flushAnimationFrames);

    expect(mockListScrollToEnd).toHaveBeenCalledWith({ animated: false });
  });

  test('lets a committed drag cancel mount-time restoration', async () => {
    const messages = [createMessage('user-1', 'user')];
    const onReady = jest.fn();
    act(() => {
      renderer = create(
        <MessageList {...listProps(messages, { initialLayoutReady: false, onReady })} />,
      );
    });
    await loadList();

    act(() => {
      mockLatestListProps?.onScrollBeginDrag?.();
      flushAnimationFrames();
    });

    expect(mockListScrollToEnd).not.toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test('lets a stateless single-turn list bootstrap at the end without a second scroll', async () => {
    const messages = [createMessage('user-1', 'user')];
    const { dataKey: _dataKey, ...statelessProps } = listProps(messages);
    act(() => {
      renderer = create(<MessageList {...statelessProps} />);
    });

    expect(mockLatestListProps?.initialScrollAtEnd).toBe(true);
    await loadList();
    expect(mockListScrollToEnd).not.toHaveBeenCalled();
  });

  test('restores a saved semantic row anchor instead of a raw pixel offset', async () => {
    const messages = [
      createMessage('user-1', 'user'),
      createMessage('assistant-1', 'assistant'),
      createMessage('user-2', 'user'),
    ];
    cacheService.set('chat.scroll_anchor.session-1', { key: 'assistant-1', offset: 24 });
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });

    await loadList();

    expect(mockListScrollToIndex).toHaveBeenCalledWith({
      animated: false,
      index: 1,
      viewOffset: -24,
      viewPosition: 0,
    });
    expect(mockListScrollToEnd).not.toHaveBeenCalled();
  });

  test('restores a switched data set without waiting for a second list onLoad', async () => {
    const firstMessages = [createMessage('user-1', 'user')];
    act(() => {
      renderer = create(<MessageList {...listProps(firstMessages)} />);
    });
    await loadList();
    mockListScrollToEnd.mockClear();
    mockListScrollToIndex.mockClear();

    const nextMessages = [
      createMessage('user-2', 'user'),
      createMessage('assistant-2', 'assistant'),
    ];
    cacheService.set('chat.scroll_anchor.session-2', { key: 'assistant-2', offset: 18 });
    act(() => {
      renderer?.update(<MessageList {...listProps(nextMessages, { dataKey: 'session-2' })} />);
    });

    expect(mockListScrollToIndex).toHaveBeenCalledWith({
      animated: false,
      index: 1,
      viewOffset: -18,
      viewPosition: 0,
    });
    expect(mockLatestListProps?.dataKey).toBe('session-2');
  });

  test('auto-sticks only while following and yields immediately to a user drag', async () => {
    const messages = [createMessage('user-1', 'user'), createMessage('assistant-1', 'assistant')];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    await loadList();
    mockListScrollToEnd.mockClear();
    mockListState.isAtEnd = false;

    act(() => mockLatestListProps?.onContentSizeChange?.(390, 1_000));
    act(flushAnimationFrames);
    expect(mockListScrollToEnd).toHaveBeenCalledWith({ animated: false });

    mockListScrollToEnd.mockClear();
    act(() => {
      mockLatestListProps?.onScrollBeginDrag?.();
      mockLatestListProps?.onContentSizeChange?.(390, 1_100);
    });
    act(flushAnimationFrames);
    expect(mockListScrollToEnd).not.toHaveBeenCalled();
  });

  test('shows the scroll button when a drag leaves following after an existing false edge signal', async () => {
    const messages = [createMessage('user-1', 'user'), createMessage('assistant-1', 'assistant')];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    await loadList();

    const reaction = mockAnimatedReactions[0];
    mockLatestListProps?.sharedValues?.isAtEnd.set(false);
    act(() => reaction.react(reaction.prepare(), true));
    expect(mockScrollButtonProps?.isAtBottom).toBe(true);

    act(() => mockLatestListProps?.onScrollBeginDrag?.());

    expect(mockScrollButtonProps?.isAtBottom).toBe(false);
  });

  test('flushes the outgoing anchor and ignores its late momentum end after a data switch', async () => {
    const firstMessages = [
      createMessage('user-1', 'user'),
      createMessage('assistant-1', 'assistant'),
    ];
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    act(() => {
      renderer = create(<MessageList {...listProps(firstMessages)} />);
    });
    await loadList();

    mockListState = {
      ...mockListState,
      isAtEnd: false,
      scroll: 300,
      start: 1,
    };
    act(() => {
      mockLatestListProps?.onScrollBeginDrag?.();
      mockLatestListProps?.onScroll?.({} as never);
      mockLatestListProps?.onMomentumScrollBegin?.();
    });
    expect(cacheService.get('chat.scroll_anchor.session-1')).toEqual({
      key: 'assistant-1',
      offset: 100,
    });

    mockListState = { ...mockListState, scroll: 380 };
    act(() => mockLatestListProps?.onScroll?.({} as never));
    expect(cacheService.get('chat.scroll_anchor.session-1')).toEqual({
      key: 'assistant-1',
      offset: 100,
    });

    cacheService.set('chat.scroll_anchor.session-2', { key: 'user-2', offset: 12 });
    const secondMessages = [createMessage('user-2', 'user')];
    act(() => {
      renderer?.update(
        <MessageList
          {...listProps(secondMessages, { dataKey: 'session-2', initialLayoutReady: false })}
        />,
      );
    });

    expect(cacheService.get('chat.scroll_anchor.session-1')).toEqual({
      key: 'assistant-1',
      offset: 180,
    });
    act(() => mockLatestListProps?.onMomentumScrollEnd?.());
    expect(cacheService.get('chat.scroll_anchor.session-2')).toEqual({
      key: 'user-2',
      offset: 12,
    });
  });

  test('a local send owns one keyboard-aware animated scroll', async () => {
    const messages = [createMessage('user-1', 'user')];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    await loadList();
    mockListScrollToEnd.mockClear();

    const nextMessages = [...messages, createMessage('user-2', 'user')];
    act(() => {
      renderer?.update(
        <MessageList {...listProps(nextMessages, { enteringMessageId: 'user-2' })} />,
      );
    });
    act(flushAnimationFrames);

    expect(mockScrollMessageToEnd).toHaveBeenCalledTimes(1);
    expect(mockScrollMessageToEnd).toHaveBeenCalledWith({
      animated: true,
      closeKeyboard: true,
    });
    expect(mockListScrollToEnd).not.toHaveBeenCalled();
  });

  test('the explicit scroll button returns reading mode to the live edge', async () => {
    const messages = [createMessage('user-1', 'user')];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    await loadList();
    mockListScrollToEnd.mockClear();
    mockListState.isAtEnd = false;

    act(() => mockLatestListProps?.onScrollBeginDrag?.());
    const reaction = mockAnimatedReactions[0];
    mockLatestListProps?.sharedValues?.isAtEnd.set(false);
    act(() => reaction.react(reaction.prepare(), true));
    expect(mockScrollButtonProps?.isAtBottom).toBe(false);

    act(() => mockScrollButtonProps?.onPress());
    expect(mockListScrollToEnd).toHaveBeenCalledWith({ animated: true });
    expect(mockScrollButtonProps?.isAtBottom).toBe(true);
  });

  test('keeps layout, pagination, role dispatch, and Android keyboard semantics', () => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const messages = [createMessage('user-1', 'user'), createMessage('assistant-1', 'assistant')];
    const onLoadOlder = jest.fn(async () => undefined);

    try {
      act(() => {
        renderer = create(<MessageList {...listProps(messages, { onLoadOlder })} />);
      });
      act(() => mockLatestListProps?.onStartReached?.());

      expect(mockRenderMessage).toHaveBeenNthCalledWith(1, messages[0]);
      expect(mockRenderMessage).toHaveBeenNthCalledWith(2, messages[1]);
      expect(mockLatestListProps?.getItemType?.(messages[0])).toBe('user');
      expect(mockLatestListProps?.getItemType?.(messages[1])).toBe('assistant');
      expect(mockLatestListProps?.keyboardDismissMode).toBe('on-drag');
      expect(mockLatestListProps?.contentContainerStyle).toEqual({
        paddingBottom: 80,
        paddingTop: 12,
      });
      expect(mockLatestListProps?.showsVerticalScrollIndicator).toBe(false);
      expect(onLoadOlder).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  });
});

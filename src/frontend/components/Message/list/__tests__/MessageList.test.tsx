import type { LegendListRef } from '@legendapp/list/react-native';
import type { ReactNode, Ref } from 'react';
import { Platform, Pressable, type LayoutChangeEvent } from 'react-native';
import {
  KeyboardController,
  useGenericKeyboardHandler,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cacheService } from '@/frontend/data/CacheService';

import { MessageList } from '../../MessageList';
import type { MessageListItem, MessageListProps } from '../../types';
import { useMessageListDisclosureToggle } from '../MessageListDisclosureContext';

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
  keyExtractor?: (item: MessageListItem) => string;
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
  renderItem?: (info: { extraData?: unknown; index: number; item: MessageListItem }) => ReactNode;
  sharedValues?: { scrollOffset: SharedValue<number> };
  showsVerticalScrollIndicator?: boolean;
};

let mockLatestListProps: MockLegendListProps | undefined;
const mockKeyboardDismiss = KeyboardController.dismiss as jest.MockedFunction<
  typeof KeyboardController.dismiss
>;
const mockUseKeyboardHandler = jest.mocked(useGenericKeyboardHandler);
const mockUseKeyboardAnimation = jest.mocked(useReanimatedKeyboardAnimation);
let mockKeyboardHandlers: Parameters<typeof useGenericKeyboardHandler>[0];
let mockKeyboardHeight: SharedValue<number>;
let mockKeyboardProgress: SharedValue<number>;
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
  previous?: unknown;
  react: (current: unknown, previous: unknown) => void;
};
let mockAnimatedReactions: MockAnimatedReaction[] = [];

function flushAnimatedReactions() {
  for (const reaction of mockAnimatedReactions) {
    const current = reaction.prepare();
    reaction.react(current, reaction.previous ?? null);
    reaction.previous = current;
  }
}

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
            <Fragment key={props.keyExtractor?.(item) ?? item.id}>
              {props.renderItem?.({ extraData: props.extraData, index, item })}
            </Fragment>
          ))}
        </View>
      );
    },
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
  scrollToBottomButtonSize: 40,
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
    useDerivedValue: <T,>(factory: () => T) => {
      const factoryRef = React.useRef(factory);
      factoryRef.current = factory;
      const derivedRef = React.useRef({
        get: () => factoryRef.current(),
        get value() {
          return factoryRef.current();
        },
      });
      return derivedRef.current;
    },
    useSharedValue: <T,>(initial: T) => {
      const ref = React.useRef<SharedValue<T> | null>(null);
      ref.current ??= mockCreateSharedValue(initial);
      return ref.current;
    },
  };
});

const mockRenderMessage = jest.fn((_message: MessageListItem) => null);

function DisclosureToggleProbe() {
  const onPress = useMessageListDisclosureToggle();
  return <Pressable onPress={onPress} testID="disclosure-toggle-probe" />;
}

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

function layoutEvent(height: number): LayoutChangeEvent {
  return {
    nativeEvent: { layout: { height, width: 390, x: 0, y: 0 } },
  } as LayoutChangeEvent;
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
    mockKeyboardHeight = mockCreateSharedValue(0);
    mockKeyboardProgress = mockCreateSharedValue(0);
    mockUseKeyboardAnimation.mockReturnValue({
      height: mockKeyboardHeight,
      progress: mockKeyboardProgress,
    });
    mockUseKeyboardHandler.mockImplementation((handlers) => {
      mockKeyboardHandlers = handlers;
    });
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
      keyboardLiftBehavior: 'never',
      maintainVisibleContentPosition: { data: true },
      recycleItems: false,
    });
    expect(mockLatestListProps?.anchoredEndSpace).toBeUndefined();
    expect(mockLatestListProps?.initialScrollAtEnd).toBeUndefined();
    expect(mockLatestListProps?.maintainScrollAtEnd).toBeUndefined();

    await loadList();

    expect(mockListScrollToEnd).toHaveBeenCalledTimes(1);
    expect(mockListScrollToEnd).toHaveBeenCalledWith({ animated: false });
    expect(mockLatestListProps?.keyboardLiftBehavior).toBe('persistent');
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

  test('places a search target below the header instead of restoring the saved anchor', async () => {
    const messages = [createMessage('target', 'user'), createMessage('saved', 'assistant')];
    cacheService.set('chat.scroll_anchor.session-1', { key: 'saved', offset: 24 });
    act(() => {
      renderer = create(
        <MessageList
          {...listProps(messages, {
            contentTopInset: 96,
            initialScrollTarget: { messageId: 'target' },
            hasNewerMessages: true,
          })}
        />,
      );
    });
    await loadList();
    expect(mockListScrollToIndex).toHaveBeenCalledWith({
      animated: false,
      index: 0,
      viewOffset: 96,
      viewPosition: 0,
    });
    mockListScrollToIndex.mockClear();
    act(() => {
      renderer?.update(
        <MessageList
          {...listProps([...messages, createMessage('later', 'assistant')], {
            contentTopInset: 96,
            initialScrollTarget: { messageId: 'target' },
            hasNewerMessages: true,
          })}
        />,
      );
    });
    expect(mockListScrollToIndex).not.toHaveBeenCalled();
  });

  test('keeps the end of an incomplete history window in reading mode', async () => {
    const onReturnToLatest = jest.fn();
    act(() => {
      renderer = create(
        <MessageList
          {...listProps([createMessage('target', 'user')], {
            hasNewerMessages: true,
            initialScrollTarget: { messageId: 'target' },
            onReturnToLatest,
          })}
        />,
      );
    });
    await loadList();
    act(() => {
      mockLatestListProps?.onScrollBeginDrag?.();
      mockLatestListProps?.onScrollEndDrag?.();
      mockLatestListProps?.onContentSizeChange?.(320, 1200);
      flushAnimationFrames();
    });
    expect(mockListScrollToEnd).not.toHaveBeenCalled();
    expect(mockScrollButtonProps?.isAtBottom).toBe(false);
    await act(async () => mockScrollButtonProps?.onPress());
    expect(onReturnToLatest).toHaveBeenCalledTimes(1);
    expect(mockListScrollToEnd).not.toHaveBeenCalled();
  });

  test('auto-sticks only while following and yields immediately to a user drag', async () => {
    const messages = [createMessage('user-1', 'user'), createMessage('assistant-1', 'assistant')];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    await loadList();
    mockListScrollToEnd.mockClear();
    mockListState.isAtEnd = false;

    expect(mockLatestListProps?.keyboardLiftBehavior).toBe('persistent');

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
    expect(mockLatestListProps?.keyboardLiftBehavior).toBe('never');
  });

  test('defers queued and ongoing layout corrections until the keyboard animation finishes', async () => {
    act(() => {
      renderer = create(<MessageList {...listProps([createMessage('user-1', 'user')])} />);
    });
    await loadList();
    mockListScrollToEnd.mockClear();

    act(() => {
      mockLatestListProps?.onLayout?.(layoutEvent(500));
      mockKeyboardHandlers.onStart?.({} as never);
      flushAnimationFrames();
      mockLatestListProps?.onLayout?.(layoutEvent(460));
      mockLatestListProps?.onContentSizeChange?.(390, 1_100);
      flushAnimationFrames();
    });
    expect(mockListScrollToEnd).not.toHaveBeenCalled();

    act(() => {
      mockKeyboardHandlers.onEnd?.({} as never);
      mockLatestListProps?.onLayout?.(layoutEvent(440));
      flushAnimationFrames();
    });
    expect(mockListScrollToEnd).toHaveBeenCalledTimes(1);
    expect(mockListScrollToEnd).toHaveBeenCalledWith({ animated: false });

    // Multiline text and attachments also resize the composer while the keyboard is still.
    mockListScrollToEnd.mockClear();
    act(() => mockLatestListProps?.onLayout?.(layoutEvent(400)));
    act(flushAnimationFrames);
    act(() => mockLatestListProps?.onLayout?.(layoutEvent(440)));
    act(flushAnimationFrames);
    expect(mockListScrollToEnd).toHaveBeenCalledTimes(2);
  });

  test('corrects the live edge after keyboard dismissal even without a viewport resize', async () => {
    act(() => {
      renderer = create(<MessageList {...listProps([createMessage('user-1', 'user')])} />);
    });
    await loadList();
    mockListScrollToEnd.mockClear();

    act(() => {
      mockKeyboardHandlers.onInteractive?.({} as never);
      mockLatestListProps?.onContentSizeChange?.(390, 1_100);
      flushAnimationFrames();
    });
    expect(mockListScrollToEnd).not.toHaveBeenCalled();
    act(() => mockKeyboardHandlers.onEnd?.({} as never));
    act(flushAnimationFrames);
    expect(mockListScrollToEnd).toHaveBeenCalledTimes(1);
  });

  test('does not resume following when the user drags during a keyboard transition', async () => {
    act(() => {
      renderer = create(<MessageList {...listProps([createMessage('user-1', 'user')])} />);
    });
    await loadList();
    mockListScrollToEnd.mockClear();
    act(() => {
      mockKeyboardHandlers.onStart?.({} as never);
      mockLatestListProps?.onLayout?.(layoutEvent(440));
      mockLatestListProps?.onScrollBeginDrag?.();
      mockKeyboardHandlers.onEnd?.({} as never);
      flushAnimationFrames();
    });
    expect(mockLatestListProps?.keyboardLiftBehavior).toBe('never');
    expect(mockListScrollToEnd).not.toHaveBeenCalled();
  });

  test('resumes following only at the visible bottom including the keyboard inset', async () => {
    act(() => {
      renderer = create(<MessageList {...listProps([createMessage('user-1', 'user')])} />);
    });
    await loadList();
    mockListScrollToEnd.mockClear();
    // The library reports isAtEnd at the old bottom even with 200px of keyboard inset.
    mockListState.contentLength = 1_100;
    act(() => {
      mockLatestListProps?.onScrollBeginDrag?.();
      mockLatestListProps?.onScrollEndDrag?.();
      mockLatestListProps?.onContentSizeChange?.(390, 1_200);
      flushAnimationFrames();
    });
    expect(mockLatestListProps?.keyboardLiftBehavior).toBe('never');
    expect(mockListScrollToEnd).not.toHaveBeenCalled();

    mockListState.scroll = 700;
    act(() => {
      mockLatestListProps?.onScrollBeginDrag?.();
      mockLatestListProps?.onScrollEndDrag?.();
      mockLatestListProps?.onLayout?.(layoutEvent(440));
      flushAnimationFrames();
    });
    expect(mockLatestListProps?.keyboardLiftBehavior).toBe('persistent');
    expect(mockListScrollToEnd).toHaveBeenCalledTimes(1);
  });

  test('keeps a tapped disclosure anchored instead of sticking its growth to the end', async () => {
    const messages = [createMessage('assistant-1', 'assistant')];
    act(() => {
      renderer = create(
        <MessageList
          {...listProps(messages, { renderMessage: () => <DisclosureToggleProbe /> })}
        />,
      );
    });
    await loadList();
    mockListScrollToEnd.mockClear();

    act(() => renderer!.root.findByProps({ testID: 'disclosure-toggle-probe' }).props.onPress());
    act(() => mockLatestListProps?.onContentSizeChange?.(390, 1_100));
    act(flushAnimationFrames);

    expect(mockListScrollToEnd).not.toHaveBeenCalled();
  });

  test('shows the scroll button when a drag leaves following after an existing false edge signal', async () => {
    const messages = [createMessage('user-1', 'user'), createMessage('assistant-1', 'assistant')];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    await loadList();
    act(() => {
      mockLatestListProps?.onLayout?.(layoutEvent(400));
      mockLatestListProps?.onContentSizeChange?.(390, 500);
    });

    act(flushAnimatedReactions);
    expect(mockScrollButtonProps?.isAtBottom).toBe(true);

    act(() => mockLatestListProps?.onScrollBeginDrag?.());

    expect(mockScrollButtonProps?.isAtBottom).toBe(false);
  });

  test('only exposes the scroll button when the content exceeds the viewport', async () => {
    const messages = [createMessage('user-1', 'user')];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    await loadList();

    act(() => {
      mockLatestListProps?.onLayout?.(layoutEvent(400));
      mockLatestListProps?.onContentSizeChange?.(390, 300);
      mockLatestListProps?.onScrollBeginDrag?.();
    });
    act(flushAnimatedReactions);

    expect(mockScrollButtonProps?.isAtBottom).toBe(true);

    act(() => mockLatestListProps?.onContentSizeChange?.(390, 500));
    act(flushAnimatedReactions);

    expect(mockScrollButtonProps?.isAtBottom).toBe(false);
  });

  test('keeps the return button above the keyboard when short content becomes obscured', async () => {
    act(() => {
      renderer = create(<MessageList {...listProps([createMessage('user-1', 'user')])} />);
    });
    await loadList();
    act(() => {
      mockLatestListProps?.onLayout?.(layoutEvent(400));
      mockLatestListProps?.onContentSizeChange?.(390, 300);
      mockLatestListProps?.onScrollBeginDrag?.();
      flushAnimatedReactions();
    });
    expect(mockScrollButtonProps?.isAtBottom).toBe(true);

    mockKeyboardHeight.set(-200);
    mockKeyboardProgress.set(1);
    act(flushAnimatedReactions);
    expect(mockScrollButtonProps?.isAtBottom).toBe(false);
    expect(mockScrollButtonProps?.bottomAccessoryHeight?.get()).toBe(174);

    mockLatestListProps?.sharedValues?.scrollOffset.set(74);
    act(flushAnimatedReactions);
    expect(mockScrollButtonProps?.isAtBottom).toBe(true);

    mockLatestListProps?.sharedValues?.scrollOffset.set(0);
    mockKeyboardHeight.set(0);
    mockKeyboardProgress.set(0);
    act(flushAnimatedReactions);
    expect(mockScrollButtonProps?.isAtBottom).toBe(true);
    expect(mockScrollButtonProps?.bottomAccessoryHeight?.get()).toBe(0);
  });

  test('adds floating composer growth to the keyboard position of the return button', () => {
    const accessoryHeight = mockCreateSharedValue(80);
    act(() => {
      renderer = create(
        <MessageList
          {...listProps([createMessage('user-1', 'user')], {
            bottomAccessoryHeight: accessoryHeight,
          })}
        />,
      );
    });
    mockKeyboardHeight.set(-100);
    mockKeyboardProgress.set(0.5);
    expect(mockScrollButtonProps?.bottomAccessoryHeight?.get()).toBe(167);
    accessoryHeight.set(120);
    expect(mockScrollButtonProps?.bottomAccessoryHeight?.get()).toBe(207);
  });

  test('rerenders only the changed row during a streaming update', () => {
    const userMessage = createMessage('user-1', 'user');
    const streamingMessage = createMessage('assistant-1', 'assistant');
    const messages = [userMessage, streamingMessage];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    mockRenderMessage.mockClear();

    const updatedStreamingMessage: MessageListItem = {
      ...streamingMessage,
      data: { parts: [{ text: 'assistant-1 updated', type: 'text' }] },
    };
    act(() => {
      renderer?.update(<MessageList {...listProps([userMessage, updatedStreamingMessage])} />);
    });

    expect(mockRenderMessage).toHaveBeenCalledTimes(1);
    expect(mockRenderMessage).toHaveBeenCalledWith(updatedStreamingMessage);
  });

  test('rerenders every row when extra data invalidates external rendering state', () => {
    const messages = [createMessage('user-1', 'user'), createMessage('assistant-1', 'assistant')];
    const initialExtraData = { isToolbarEnabled: false };
    act(() => {
      renderer = create(<MessageList {...listProps(messages, { extraData: initialExtraData })} />);
    });
    mockRenderMessage.mockClear();

    act(() => {
      renderer?.update(
        <MessageList {...listProps(messages, { extraData: { isToolbarEnabled: true } })} />,
      );
    });

    expect(mockRenderMessage).toHaveBeenCalledTimes(2);
    expect(mockRenderMessage).toHaveBeenNthCalledWith(1, messages[0]);
    expect(mockRenderMessage).toHaveBeenNthCalledWith(2, messages[1]);
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

  test('scrolls to a local send without changing keyboard state', async () => {
    const messages = [createMessage('user-1', 'user')];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    await loadList();
    mockListScrollToEnd.mockClear();
    mockKeyboardDismiss.mockClear();

    const nextMessages = [...messages, createMessage('user-2', 'user')];
    act(() => {
      renderer?.update(
        <MessageList {...listProps(nextMessages, { enteringMessageId: 'user-2' })} />,
      );
    });
    await act(async () => flushAnimationFrames());

    expect(mockKeyboardDismiss).not.toHaveBeenCalled();
    expect(mockListScrollToEnd).toHaveBeenCalledTimes(1);
    expect(mockListScrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  test.each(['drag', 'dataset switch'] as const)(
    'cancels the scheduled send scroll when a %s takes precedence',
    async (interruption) => {
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
      act(() => {
        if (interruption === 'drag') {
          mockLatestListProps?.onScrollBeginDrag?.();
        } else {
          renderer?.update(
            <MessageList
              {...listProps([createMessage('other-user', 'user')], {
                dataKey: 'session-2',
                initialLayoutReady: false,
              })}
            />,
          );
        }
      });
      await act(async () => flushAnimationFrames());
      expect(mockListScrollToEnd).not.toHaveBeenCalled();
    },
  );

  test('hands a Draft list to its durable Session without restoring or scrolling again', async () => {
    const pending = [
      { ...createMessage('user-1', 'user'), status: 'pending' as const },
      { ...createMessage('assistant-1', 'assistant'), status: 'pending' as const },
    ];
    act(() => {
      renderer = create(
        <MessageList
          {...listProps(pending, {
            dataKey: 'session-1',
            enteringMessageId: 'user-1',
          })}
        />,
      );
    });
    await loadList();
    const keys = pending.map((message) => mockLatestListProps!.keyExtractor!(message));
    mockListScrollToEnd.mockClear();
    mockListScrollToIndex.mockClear();
    mockKeyboardDismiss.mockClear();
    const accepted = pending.map((message) => ({ ...message, status: 'success' as const }));
    await act(async () => {
      renderer?.update(
        <MessageList
          {...listProps(accepted, {
            dataKey: 'session-1',
            enteringMessageId: 'user-1',
          })}
        />,
      );
    });
    act(flushAnimationFrames);
    expect(accepted.map((message) => mockLatestListProps!.keyExtractor!(message))).toEqual(keys);
    expect(mockListScrollToEnd).not.toHaveBeenCalled();
    expect(mockListScrollToIndex).not.toHaveBeenCalled();
    expect(mockKeyboardDismiss).not.toHaveBeenCalled();

    mockListState.isAtEnd = false;
    mockListState.start = 0;
    mockListState.scroll = 32;
    act(() => {
      mockLatestListProps?.onScrollBeginDrag?.();
      mockLatestListProps?.onScroll?.({} as never);
    });
    expect(cacheService.get('chat.scroll_anchor.session-1')).toEqual({ key: 'user-1', offset: 32 });
  });

  test('the explicit scroll button returns reading mode to the live edge', async () => {
    const messages = [createMessage('user-1', 'user')];
    act(() => {
      renderer = create(<MessageList {...listProps(messages)} />);
    });
    await loadList();
    mockListScrollToEnd.mockClear();
    mockListState.isAtEnd = false;

    act(() => {
      mockLatestListProps?.onLayout?.(layoutEvent(400));
      mockLatestListProps?.onContentSizeChange?.(390, 500);
      mockLatestListProps?.onScrollBeginDrag?.();
    });
    act(flushAnimatedReactions);
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
      expect(mockLatestListProps?.keyboardDismissMode).toBe('none');
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

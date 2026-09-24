import { type ComponentProps, type ReactNode, useMemo } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationMessage, ConversationSnapshot } from '@/frontend/appShell/conversation';
import type { MessageListItem, MessageListProps } from '@/frontend/components/Message';
import type { AgentApprovalView, AgentMessageView } from '@/shared/contracts/agent';

import {
  mergeAgentMessageViews,
  toAgentMessageListItem,
} from '../../../runtime/agentMessageProjection';
import type { PendingChatSend } from '../../../runtime/ChatProvider';
import { ChatWorkspace as Workspace } from '../ChatWorkspace';

const mockPendingSendDisplayed = jest.fn();
const mockLoadOlder = jest.fn(async () => undefined);
const mockRetry = jest.fn(async () => undefined);
const mockRetryMessage = jest.fn(async (_input: unknown): Promise<void> => undefined);
let mockIsSessionBusy = false;
const mockForkSession = jest.fn(async () => undefined);
const mockSetStringAsync = jest.fn(async (_text: string): Promise<void> => undefined);
const mockToastShow = jest.fn();
const mockTranslate = (key: string) => key;
let mockCoverVisible: boolean | undefined;
let mockIsLoadingOlder: boolean | undefined;
let mockMessageListProps: MessageListProps | undefined;
let mockAgentChatSession: {
  activeTurn: null;
  enteringUserMessageId?: string;
  hasHistoryBeforeActiveTurn?: boolean;
  liveMessages: readonly AgentMessageView[];
  pendingApprovals: readonly AgentApprovalView[];
  pendingQuestion: null;
  retryingMessageId?: string;
  sessionId: string;
  status: 'ready';
};

jest.mock('../hooks/useIsScreenReaderEnabled', () => ({
  useIsScreenReaderEnabled: () => false,
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
}));

jest.mock('expo-router/react-navigation', () => ({
  useHeaderHeight: () => 52,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 24 }),
}));

jest.mock('@/frontend/appShell/header', () => ({
  mainHeaderRowHeight: 56,
}));

jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/copy', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/ellipsis', () => () => null);

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    ActionMenu: ({ children }: { children: ReactNode }) => children,
    BackgroundPressExclusion: ({ children }: { children: ReactNode }) => children,
    Button: (props: object) => createElement('Button', props),
    ContentState: {
      Error: (props: object) => createElement('ContentState.Error', props),
    },
    ContextMenu: ({ children }: { children: ReactNode }) => children,
    ContextMenuExclusion: ({ children }: { children: ReactNode }) => children,
    useAlert: () => ({ alert: { confirm: jest.fn() } }),
    useToast: () => ({ toast: { show: mockToastShow } }),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockTranslate,
    i18n: { language: 'en-US', resolvedLanguage: 'en-US' },
  }),
}));

jest.mock('@/frontend/components/Message', () => ({
  AssistantMessage: ({ children, message }: { children: ReactNode; message: MessageListItem }) => {
    const { createElement } = jest.requireActual('react');
    return createElement('AssistantMessage', { message }, children);
  },
  MessageList: (props: MessageListProps) => {
    const { createElement, Fragment } = jest.requireActual('react');
    mockMessageListProps = props;
    return createElement(
      Fragment,
      null,
      ...props.messages.map((message) =>
        createElement(Fragment, { key: message.id }, props.renderMessage(message)),
      ),
    );
  },
  UserMessage: ({ message }: { message: MessageListItem }) => {
    const { createElement } = jest.requireActual('react');
    return createElement('UserMessage', { message });
  },
}));

jest.mock('@/frontend/components/Avatar', () => ({
  AgentAvatar: (props: object) => {
    const { createElement } = jest.requireActual('react');
    return createElement('AgentAvatar', props);
  },
}));

jest.mock('@/frontend/utils/constants', () => ({
  isIOS: false,
}));

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentSession: () => ({ data: { agentId: 'agent-1', title: 'Session title' } }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ debug: jest.fn(), error: jest.fn() }),
  },
}));

jest.mock('../../ConversationApprovals', () => ({ ConversationApprovals: () => null }));

const projected = new WeakMap<AgentMessageView, ConversationMessage>();
function project(message: AgentMessageView): ConversationMessage {
  const existing = projected.get(message);
  if (existing) return existing;
  const value: ConversationMessage = {
    key: message.id,
    state: message.status,
    completeness: 'complete',
    actions: {
      retry: {
        availability: { state: 'enabled' },
        execute: async () => {
          await mockRetryMessage({ sessionId: 'session-1', messageId: message.id });
          return { state: 'applied', value: undefined };
        },
      },
      fork: {
        availability: { state: 'enabled' },
        execute: async () => {
          await mockForkSession();
          return { state: 'applied', value: { source: { kind: 'local' }, sessionId: 'fork' } };
        },
      },
    },
    display: toAgentMessageListItem(message) ?? {
      id: message.id,
      role: message.role,
      status: 'success',
      data: {},
    },
  };
  projected.set(message, value);
  return value;
}
// Feed the same scenarios through the public consumption views, preserving the existing assertions.
function ChatWorkspace(
  props: Omit<ComponentProps<typeof Workspace>, 'snapshot' | 'messageWindow' | 'messages'> & {
    messageWindow: Omit<
      ComponentProps<typeof Workspace>['messageWindow'],
      'messages' | 'dataKey' | 'hasOlderMessages'
    > & {
      messages: readonly AgentMessageView[];
      dataKey?: string;
      hasOlderMessages?: boolean;
    };
  },
) {
  const snapshot: ConversationSnapshot = {
    title: '',
    freshness: { state: 'current' },
    executions: mockIsSessionBusy ? [{ id: 'turn', state: 'running' }] : [],
    interactions: [],
    liveMessages: mockAgentChatSession.liveMessages.map(project),
    enteringMessageKey: mockAgentChatSession.enteringUserMessageId,
    retryingMessageKey: mockAgentChatSession.retryingMessageId,
    hasHistoryBeforeExecution: mockAgentChatSession.hasHistoryBeforeActiveTurn,
  };
  const history = props.messageWindow.messages;
  const live = mockAgentChatSession.liveMessages;
  const { hasNewerMessages } = props.messageWindow;
  // The production hook memoizes merged rows, so unchanged inputs keep the same array identity.
  const merged = useMemo(
    () => (hasNewerMessages ? history : mergeAgentMessageViews(history, live)).map(project),
    [hasNewerMessages, history, live],
  );
  return (
    <Workspace
      {...props}
      snapshot={snapshot}
      messages={merged}
      messageWindow={{
        ...props.messageWindow,
        hasOlderMessages: true,
        dataKey:
          props.messageWindow.dataKey ?? props.sessionId ?? props.pendingSend?.sessionId ?? '',
        messages: history.map(project),
      }}
    />
  );
}

jest.mock('../components/ChatInitialRenderCover', () => ({
  ChatInitialRenderCover: ({ isVisible }: { isVisible: boolean }) => {
    mockCoverVisible = isVisible;
    return null;
  },
}));

jest.mock('../components/ChatForkOriginDivider', () => ({
  ChatForkOriginDivider: ({ sourceSessionId }: { sourceSessionId: string }) => {
    const { createElement } = jest.requireActual('react');
    return createElement('ChatForkOriginDivider', { sourceSessionId });
  },
}));

jest.mock('../components/ChatOlderMessagesIndicator', () => ({
  ChatOlderMessagesIndicator: ({ isLoading }: { isLoading: boolean }) => {
    mockIsLoadingOlder = isLoading;
    return null;
  },
}));

function createMessage(
  id: string,
  role: AgentMessageView['role'],
  status: AgentMessageView['status'] = 'success',
): AgentMessageView {
  return {
    createdAt: '2026-08-09T00:00:00.000Z',
    id,
    parts: [{ id: `${id}-text`, state: 'done', text: id, type: 'text' }],
    role,
    sessionId: 'session-1',
    status,
    turnId: 'turn-1',
    updatedAt: '2026-08-09T00:00:00.000Z',
    usage: null,
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
  };
}

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((_resolve, promiseReject) => {
    reject = promiseReject;
  });
  return { promise, reject };
}

function renderWorkspace(
  isPreview: boolean,
  messages: readonly AgentMessageView[],
  sessionId = 'session-1',
  isLoadingInitial = false,
  fork?: { boundaryMessageId: string; sourceSessionId: string },
) {
  let renderer!: ReactTestRenderer;

  act(() => {
    renderer = create(
      createWorkspaceElement(isPreview, messages, sessionId, isLoadingInitial, fork),
    );
  });

  return renderer;
}

function createWorkspaceElement(
  isPreview: boolean,
  messages: readonly AgentMessageView[],
  sessionId = 'session-1',
  isLoadingInitial = false,
  fork?: { boundaryMessageId: string; sourceSessionId: string },
) {
  return (
    <ChatWorkspace
      onPendingSendDisplayed={mockPendingSendDisplayed}
      contentBottomInset={isPreview ? 12 : 96}
      forkBoundaryMessageId={fork?.boundaryMessageId}
      forkedFromSessionId={fork?.sourceSessionId}
      isAssistantToolbarEnabled={!isPreview}
      keyboardOffset={isPreview ? 0 : 26}
      messageWindow={{
        hasNewerMessages: false,
        isLoadingInitial,
        isRefreshing: false,
        isLoadingNewer: false,
        isLoadingOlder: true,
        loadNewer: mockLoadOlder,
        loadOlder: mockLoadOlder,
        messages,
        retry: mockRetry,
      }}
      sessionId={sessionId}
    />
  );
}

describe('ChatWorkspace message rendering integration', () => {
  let renderer: ReactTestRenderer | undefined;
  let requestAnimationFrameSpy: jest.SpyInstance;
  let readyFrame: FrameRequestCallback | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSessionBusy = false;
    mockAgentChatSession = {
      activeTurn: null,
      liveMessages: [],
      pendingApprovals: [],
      pendingQuestion: null,
      sessionId: 'session-1',
      status: 'ready',
    };
    mockCoverVisible = undefined;
    mockIsLoadingOlder = undefined;
    mockMessageListProps = undefined;
    readyFrame = undefined;
    requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        readyFrame = callback;
        return 1;
      });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    requestAnimationFrameSpy.mockRestore();
  });

  test('keeps the first exchange visible through a terminal snapshot and merges partial history by the same IDs', () => {
    const pendingSend: PendingChatSend = {
      sessionId: 'session-1',
      isNewSession: true,
      isSubmitting: true,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          status: 'pending',
          data: { parts: [{ type: 'text', text: 'Hello' }] },
        },
        { id: 'assistant-1', role: 'assistant', status: 'pending', data: { parts: [] } },
      ],
    };
    const props = {
      pendingSend,
      enteringUserMessageId: 'user-1',
      onPendingSendDisplayed: mockPendingSendDisplayed,
      contentBottomInset: 96,
      isAssistantToolbarEnabled: false,
      keyboardOffset: 26,
      messageWindow: {
        hasNewerMessages: false,
        isLoadingInitial: true,
        isRefreshing: false,
        isLoadingNewer: false,
        isLoadingOlder: false,
        loadNewer: mockLoadOlder,
        loadOlder: mockLoadOlder,
        messages: [],
        retry: mockRetry,
      },
    };
    act(() => {
      renderer = create(<ChatWorkspace {...props} />);
    });
    expect(mockMessageListProps?.messages.map((message) => message.id)).toEqual([
      'user-1',
      'assistant-1',
    ]);
    expect(mockMessageListProps).toMatchObject({
      dataKey: 'session-1',
      enteringMessageId: 'user-1',
      initialLayoutReady: true,
    });
    expect(mockCoverVisible).toBe(false);

    // The initial snapshot can already be terminal and carry no live pair.
    act(() => {
      renderer?.update(<ChatWorkspace {...props} sessionId="session-1" />);
    });
    expect(mockMessageListProps?.messages).toEqual(pendingSend.messages);
    expect(mockCoverVisible).toBe(false);
    expect(mockPendingSendDisplayed).not.toHaveBeenCalled();

    const user = createMessage('user-1', 'user');
    const assistant = createMessage('assistant-1', 'assistant');
    act(() => {
      renderer?.update(
        <ChatWorkspace
          {...props}
          sessionId="session-1"
          messageWindow={{ ...props.messageWindow, messages: [assistant] }}
        />,
      );
    });
    expect(mockMessageListProps?.messages.map((message) => message.id)).toEqual([
      'user-1',
      'assistant-1',
    ]);
    expect(mockMessageListProps?.messages[0]).toBe(pendingSend.messages[0]);
    expect(mockMessageListProps?.messages[1].status).toBe('success');
    expect(mockPendingSendDisplayed).not.toHaveBeenCalled();
    act(() => {
      renderer?.update(
        <ChatWorkspace
          {...props}
          sessionId="session-1"
          messageWindow={{
            ...props.messageWindow,
            hasOlderMessages: true,
            messages: [user, assistant],
            isLoadingInitial: false,
          }}
        />,
      );
    });
    expect(mockMessageListProps?.messages.map((message) => message.id)).toEqual([
      'user-1',
      'assistant-1',
    ]);
    expect(mockPendingSendDisplayed).toHaveBeenCalledWith('user-1');
  });

  test('merges live rows with displayable history and passes list layout', () => {
    const pendingUserMessage = createMessage('user-pending', 'user', 'pending');
    const messages = [
      createMessage('system-1', 'system'),
      createMessage('user-1', 'user'),
      createMessage('assistant-1', 'assistant'),
    ];
    mockAgentChatSession = {
      ...mockAgentChatSession,
      enteringUserMessageId: pendingUserMessage.id,
      liveMessages: [pendingUserMessage],
    };

    renderer = renderWorkspace(false, messages);

    expect(mockMessageListProps?.messages.map((message) => message.id)).toEqual([
      'user-1',
      'assistant-1',
      'user-pending',
    ]);
    expect(mockMessageListProps?.enteringMessageId).toBe('user-pending');
    expect(mockMessageListProps?.contentBottomInset).toBe(96);
    expect(mockMessageListProps?.dataKey).toBe('session-1');
    expect(mockMessageListProps?.initialLayoutReady).toBe(true);
    expect(mockMessageListProps?.keyboardOffset).toBe(26);
    expect(mockMessageListProps?.onLoadOlder).toBe(mockLoadOlder);
    expect(mockIsLoadingOlder).toBe(true);

    const renderMessage = mockMessageListProps?.renderMessage;
    act(() => renderer?.update(createWorkspaceElement(false, messages)));
    expect(mockMessageListProps?.renderMessage).toBe(renderMessage);
  });

  test('empties the retrying answer while admission runs, so the wait reads as pending', () => {
    const messages = [createMessage('user-1', 'user'), createMessage('assistant-1', 'assistant')];
    mockAgentChatSession = { ...mockAgentChatSession, retryingMessageId: 'assistant-1' };

    renderer = renderWorkspace(false, messages);

    expect(mockMessageListProps?.messages).toEqual([
      expect.objectContaining({ id: 'user-1', status: 'success' }),
      expect.objectContaining({ id: 'assistant-1', status: 'pending', data: { parts: [] } }),
    ]);
  });

  test('composes the assistant toolbar for settled assistant messages', () => {
    renderer = renderWorkspace(false, [createMessage('assistant-1', 'assistant')]);

    const assistantMessage = renderer.root.findByType('AssistantMessage');
    expect(
      assistantMessage.findAllByProps({ testID: 'assistant-message-toolbar' }).length,
    ).toBeGreaterThan(0);
  });

  test('renders a fork origin after the persisted copied-history boundary', () => {
    const messages = [
      createMessage('copied-user', 'user'),
      createMessage('copied-assistant', 'assistant'),
      createMessage('branch-user', 'user'),
    ];

    renderer = renderWorkspace(false, messages, 'session-1', false, {
      boundaryMessageId: 'copied-assistant',
      sourceSessionId: 'source-session',
    });

    expect(mockMessageListProps?.messages.map((message) => message.id)).toEqual([
      'copied-user',
      'copied-assistant',
      'fork-origin:session-1',
      'branch-user',
    ]);
    expect(renderer.root.findByType('ChatForkOriginDivider').props.sourceSessionId).toBe(
      'source-session',
    );
  });

  test('does not render a fork origin before pagination loads its boundary', () => {
    renderer = renderWorkspace(false, [createMessage('branch-user', 'user')], 'session-1', false, {
      boundaryMessageId: 'copied-assistant',
      sourceSessionId: 'source-session',
    });

    expect(mockMessageListProps?.messages.map((message) => message.id)).toEqual(['branch-user']);
    expect(renderer.root.findAllByType('ChatForkOriginDivider')).toHaveLength(0);
  });

  test('does not reuse a child key across Session-scoped surfaces', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      renderer = renderWorkspace(false, [createMessage('assistant-1', 'assistant')]);

      expect(
        consoleError.mock.calls.some(([message]) =>
          String(message).includes('Encountered two children with the same key'),
        ),
      ).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  test('does not show copy failure feedback from the previous Session', async () => {
    const clipboardWrite = createDeferred<void>();
    const assistant = createMessage('assistant-1', 'assistant');
    mockSetStringAsync.mockReturnValueOnce(clipboardWrite.promise);
    renderer = renderWorkspace(false, [assistant]);

    const copyButton = renderer.root.findByProps({ testID: 'assistant-message-copy' });
    act(() => copyButton.props.onPress());
    act(() => renderer?.update(createWorkspaceElement(false, [assistant], 'session-2')));
    await act(async () => clipboardWrite.reject(new Error('copy failed')));

    expect(mockToastShow).not.toHaveBeenCalled();
  });

  test('uses preview insets and hides assistant actions in preview', () => {
    renderer = renderWorkspace(true, [createMessage('assistant-1', 'assistant')]);

    expect(mockMessageListProps?.contentBottomInset).toBe(12);
    expect(mockMessageListProps?.keyboardOffset).toBe(0);
    expect(renderer.root.findAllByProps({ testID: 'assistant-message-toolbar' })).toHaveLength(0);
  });

  test('passes the initial-ready callback through to the history render gate', () => {
    renderer = renderWorkspace(false, [createMessage('user-1', 'user')]);

    expect(mockCoverVisible).toBe(true);
    act(() => mockMessageListProps?.onReady?.());
    expect(readyFrame).toBeDefined();

    act(() => readyFrame?.(0));
    expect(mockCoverVisible).toBe(false);
  });

  test('shows a new Session first exchange without the history loading cover', () => {
    const user = createMessage('user-1', 'user');
    const assistant = createMessage('assistant-1', 'assistant', 'streaming');
    mockAgentChatSession = {
      ...mockAgentChatSession,
      enteringUserMessageId: user.id,
      hasHistoryBeforeActiveTurn: false,
      liveMessages: [user, assistant],
    };

    renderer = renderWorkspace(false, [], 'session-1', true);

    expect(mockMessageListProps?.messages.map((message) => message.id)).toEqual([
      'user-1',
      'assistant-1',
    ]);
    expect(mockCoverVisible).toBe(false);
  });
});

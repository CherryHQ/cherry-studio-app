import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem, MessageListProps } from '@/frontend/components/messages';
import type { AgentMessageView } from '@/shared/contracts/agent';

import { ChatWorkspace } from '../ChatWorkspace';

const mockLoadOlder = jest.fn(async () => undefined);
const mockRetry = jest.fn(async () => undefined);
const mockRespondApproval = jest.fn(async () => undefined);
const mockForkSession = jest.fn(async () => undefined);
const mockSetStringAsync = jest.fn(async (_text: string): Promise<void> => undefined);
const mockAlertShow = jest.fn();
const mockTranslate = (key: string) => key;
let mockCoverVisible: boolean | undefined;
let mockIsLoadingOlder: boolean | undefined;
let mockMessageListProps: MessageListProps | undefined;
let mockAgentChatSession: {
  activeTurn: null;
  enteringUserMessageId?: string;
  hasHistoryBeforeActiveTurn?: boolean;
  liveMessages: readonly AgentMessageView[];
  pendingApprovals: readonly [];
  sessionId: string;
  status: 'ready';
};

jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

jest.mock('expo-router/react-navigation', () => ({
  useHeaderHeight: () => 52,
}));

jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/copy', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/ellipsis', () => () => null);

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    ActionMenu: ({ children }: { children: ReactNode }) => children,
    Button: (props: object) => createElement('Button', props),
    ContentState: {
      Error: (props: object) => createElement('ContentState.Error', props),
    },
    ContextMenu: ({ children }: { children: ReactNode }) => children,
    useAlert: () => ({ alert: { show: mockAlertShow } }),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockTranslate }),
}));

jest.mock('@/frontend/components/messages', () => ({
  AssistantMessage: ({ children, message }: { children: ReactNode; message: MessageListItem }) => {
    const { createElement } = jest.requireActual('react');
    return createElement('AssistantMessage', { message }, children);
  },
  MessageList: (props: MessageListProps) => {
    mockMessageListProps = props;
    const assistant = props.messages.find((message) => message.role === 'assistant');
    return assistant ? props.renderMessage(assistant) : null;
  },
  UserMessage: ({ message }: { message: MessageListItem }) => {
    const { createElement } = jest.requireActual('react');
    return createElement('UserMessage', { message });
  },
}));

jest.mock('@/frontend/components/avatar', () => ({
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

jest.mock('../../approval/ToolApprovalSheet', () => ({
  ToolApprovalSheet: () => null,
}));

jest.mock('../../runtime', () => ({
  createAgentMessageListProjectionCache: () => ({}),
  mergeAgentMessageViews: (
    persisted: readonly AgentMessageView[],
    live: readonly AgentMessageView[],
  ) => {
    const liveById = new Map(live.map((message) => [message.id, message]));
    const persistedIds = new Set(persisted.map((message) => message.id));
    return [
      ...persisted.map((message) => liveById.get(message.id) ?? message),
      ...live.filter((message) => !persistedIds.has(message.id)),
    ];
  },
  toAgentMessageListItems: (messages: readonly AgentMessageView[]) =>
    messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({
        data: { parts: message.parts },
        id: message.id,
        role: message.role,
        status: message.status === 'success' ? 'success' : 'pending',
      })),
  useAgentChatActions: () => ({ respondApproval: mockRespondApproval }),
  useAgentChatFork: () => mockForkSession,
  useAgentChatSession: () => mockAgentChatSession,
}));

jest.mock('../components/ChatInitialRenderCover', () => ({
  ChatInitialRenderCover: ({ isVisible }: { isVisible: boolean }) => {
    mockCoverVisible = isVisible;
    return null;
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
) {
  let renderer!: ReactTestRenderer;

  act(() => {
    renderer = create(createWorkspaceElement(isPreview, messages, sessionId, isLoadingInitial));
  });

  return renderer;
}

function createWorkspaceElement(
  isPreview: boolean,
  messages: readonly AgentMessageView[],
  sessionId = 'session-1',
  isLoadingInitial = false,
) {
  return (
    <ChatWorkspace
      contentBottomInset={isPreview ? 12 : 96}
      isAssistantToolbarEnabled={!isPreview}
      keyboardOffset={isPreview ? 0 : 26}
      messageWindow={{
        isAtHistoryStart: true,
        isLoadingInitial,
        isLoadingOlder: true,
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
    mockAgentChatSession = {
      activeTurn: null,
      liveMessages: [],
      pendingApprovals: [],
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

  test('composes the assistant toolbar for settled assistant messages', () => {
    renderer = renderWorkspace(false, [createMessage('assistant-1', 'assistant')]);

    const assistantMessage = renderer.root.findByType('AssistantMessage');
    expect(
      assistantMessage.findAllByProps({ testID: 'assistant-message-toolbar' }).length,
    ).toBeGreaterThan(0);
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

    expect(mockAlertShow).not.toHaveBeenCalled();
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

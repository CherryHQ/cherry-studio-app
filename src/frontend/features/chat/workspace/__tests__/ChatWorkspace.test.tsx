import type { ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListProps } from '@/frontend/components/messages';
import type { Message } from '@/shared/data/types/message';

import { ChatWorkspace } from '../ChatWorkspace';

const mockInputHeightShared = {
  get: jest.fn(() => 80),
  set: jest.fn(),
  value: 80,
} as unknown as SharedValue<number>;
const mockLoadOlder = jest.fn(async () => undefined);
const mockRespondToolApproval = jest.fn(async () => undefined);
const mockRegenerate = jest.fn(async () => undefined);
const mockSetStringAsync = jest.fn(async (_text: string): Promise<void> => undefined);
const mockAlertShow = jest.fn();
let mockCoverVisible: boolean | undefined;
let mockIsLoadingOlder: boolean | undefined;
let mockMessageListProps: MessageListProps | undefined;
let mockChatTopic: {
  hasHistoryBeforePendingTurn?: boolean;
  isBusy: boolean;
  overlayMessage?: Message;
  pendingUserMessage?: Message;
  regenerate: typeof mockRegenerate;
  status: string;
};

jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

jest.mock('expo-router/react-navigation', () => ({
  useHeaderHeight: () => 52,
}));

jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/copy', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/refresh-cw', () => () => null);

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    Button: (props: object) => createElement('Button', props),
    useAlert: () => ({ alert: { show: mockAlertShow } }),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/messages', () => ({
  AssistantMessage: ({ children, message }: { children: ReactNode; message: Message }) => {
    const { createElement } = jest.requireActual('react');
    return createElement('AssistantMessage', { message }, children);
  },
  MessageList: (props: MessageListProps) => {
    mockMessageListProps = props;
    const assistant = props.messages.find((message) => message.role === 'assistant');
    return assistant ? props.renderMessage(assistant) : null;
  },
  UserMessage: ({ message }: { message: Message }) => {
    const { createElement } = jest.requireActual('react');
    return createElement('UserMessage', { message });
  },
}));

jest.mock('@/frontend/utils/constants', () => ({
  isIOS: false,
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ debug: jest.fn(), error: jest.fn() }),
  },
}));

jest.mock('../../approval/ToolApprovalSheet', () => ({
  ToolApprovalSheet: () => null,
}));

jest.mock('../../runtime/ChatProvider', () => ({
  useChat: () => ({ respondToolApproval: mockRespondToolApproval }),
  useChatTopic: () => mockChatTopic,
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

const now = '2026-08-09T00:00:00.000Z';

function createMessage(id: string, role: Message['role']): Message {
  return {
    createdAt: now,
    data: { parts: [{ text: id, type: 'text' }] },
    id,
    parentId: null,
    role,
    searchableText: id,
    siblingsGroupId: 0,
    status: 'success',
    topicId: 'topic-1',
    updatedAt: now,
  };
}

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((_resolve, promiseReject) => {
    reject = promiseReject;
  });
  return { promise, reject };
}

/** 预览态的取值由 ChatScreen 解析后传进来，这里照它传的两组值渲染。 */
function renderWorkspace(isPreview: boolean, messages: readonly Message[], topicId = 'topic-1') {
  let renderer!: ReactTestRenderer;

  act(() => {
    renderer = create(createWorkspaceElement(isPreview, messages, topicId));
  });

  return renderer;
}

function createWorkspaceElement(
  isPreview: boolean,
  messages: readonly Message[],
  topicId = 'topic-1',
) {
  return (
    <ChatWorkspace
      bottomAccessoryHeight={isPreview ? undefined : mockInputHeightShared}
      contentBottomInset={isPreview ? 12 : 96}
      isAssistantToolbarEnabled={!isPreview}
      keyboardOffset={isPreview ? 0 : 26}
      messageWindow={{
        isLoadingInitial: false,
        isLoadingOlder: true,
        loadOlder: mockLoadOlder,
        messages,
      }}
      renderGateKey={`${topicId}:history`}
      topicId={topicId}
    />
  );
}

describe('ChatWorkspace message rendering integration', () => {
  let renderer: ReactTestRenderer | undefined;
  let requestAnimationFrameSpy: jest.SpyInstance;
  let readyFrame: FrameRequestCallback | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChatTopic = {
      hasHistoryBeforePendingTurn: true,
      isBusy: false,
      regenerate: mockRegenerate,
      status: 'idle',
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

  test('passes displayable messages, history loading, and dock layout on a normal page', () => {
    const pendingUserMessage = createMessage('user-pending', 'user');
    const messages = [
      createMessage('system-1', 'system'),
      createMessage('user-1', 'user'),
      createMessage('assistant-1', 'assistant'),
    ];
    mockChatTopic.pendingUserMessage = pendingUserMessage;

    renderer = renderWorkspace(false, messages);

    expect(mockMessageListProps?.messages.map((message) => message.id)).toEqual([
      'user-1',
      'assistant-1',
      'user-pending',
    ]);
    expect(mockMessageListProps?.enteringMessageId).toBe('user-pending');
    expect(mockMessageListProps?.bottomAccessoryHeight).toBe(mockInputHeightShared);
    expect(mockMessageListProps?.contentBottomInset).toBe(96);
    expect(mockMessageListProps?.keyboardOffset).toBe(26);
    expect(mockMessageListProps?.onLoadOlder).toBe(mockLoadOlder);
    expect(mockIsLoadingOlder).toBe(true);

    const renderMessage = mockMessageListProps?.renderMessage;
    mockChatTopic = { ...mockChatTopic, isBusy: true };
    act(() => renderer?.update(createWorkspaceElement(false, messages)));

    expect(mockMessageListProps?.renderMessage).toBe(renderMessage);
  });

  test('composes assistant actions with topic busy and regenerate behavior', () => {
    mockChatTopic.isBusy = true;
    renderer = renderWorkspace(false, [createMessage('assistant-1', 'assistant')]);

    const assistantMessage = renderer.root.findByType('AssistantMessage');
    expect(
      assistantMessage.findAllByProps({ testID: 'assistant-message-toolbar' }).length,
    ).toBeGreaterThan(0);

    const regenerateButton = assistantMessage.findByProps({
      testID: 'assistant-message-regenerate',
    });
    expect(regenerateButton.props.disabled).toBe(true);

    act(() => regenerateButton.props.onPress());
    expect(mockRegenerate).toHaveBeenCalledWith({ messageId: 'assistant-1' });
  });

  test('does not show copy failure feedback from the previous topic', async () => {
    const clipboardWrite = createDeferred<void>();
    const assistant = createMessage('assistant-1', 'assistant');
    mockSetStringAsync.mockReturnValueOnce(clipboardWrite.promise);
    renderer = renderWorkspace(false, [assistant]);

    const copyButton = renderer.root.findByProps({ testID: 'assistant-message-copy' });
    act(() => copyButton.props.onPress());
    act(() => renderer?.update(createWorkspaceElement(false, [assistant], 'topic-2')));
    await act(async () => clipboardWrite.reject(new Error('copy failed')));

    expect(mockAlertShow).not.toHaveBeenCalled();
  });

  test('omits the internal scroll button accessory in preview', () => {
    renderer = renderWorkspace(true, [createMessage('assistant-1', 'assistant')]);

    expect(mockMessageListProps?.bottomAccessoryHeight).toBeUndefined();
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
});

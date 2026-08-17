import type { Message } from '@cherrystudio/universal/data/types/message';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListProps } from '@/frontend/components/messagePresentation';

import { ChatWorkspace } from '../ChatWorkspace';

const mockInputHeightShared = {
  get: jest.fn(() => 80),
  set: jest.fn(),
  value: 80,
} as unknown as SharedValue<number>;
const mockLoadOlder = jest.fn(async () => undefined);
const mockRespondToolApproval = jest.fn(async () => undefined);
const mockRegenerate = jest.fn(async () => undefined);
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
  setStringAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-router/react-navigation', () => ({
  useHeaderHeight: () => 52,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({ alert: { show: jest.fn() } }),
}));

jest.mock('@/frontend/components/messagePresentation', () => ({
  MessageList: (props: MessageListProps) => {
    mockMessageListProps = props;
    return null;
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

jest.mock('../components/ChatAssistantMessage', () => ({
  ChatAssistantMessage: () => null,
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

/** 预览态的取值由 ChatScreen 解析后传进来，这里照它传的两组值渲染。 */
function renderWorkspace(isPreview: boolean, messages: readonly Message[]) {
  let renderer: ReactTestRenderer | undefined;

  act(() => {
    renderer = create(createWorkspaceElement(isPreview, messages));
  });

  return renderer;
}

function createWorkspaceElement(isPreview: boolean, messages: readonly Message[]) {
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
      renderGateKey="topic-1:history"
      topicId="topic-1"
    />
  );
}

describe('ChatWorkspace message presentation integration', () => {
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
    expect(mockMessageListProps?.renderAssistantMessage).toEqual(expect.any(Function));
    expect(mockIsLoadingOlder).toBe(true);

    const renderAssistantMessage = mockMessageListProps?.renderAssistantMessage;
    mockChatTopic = { ...mockChatTopic, isBusy: true };
    act(() => renderer?.update(createWorkspaceElement(false, messages)));

    expect(mockMessageListProps?.renderAssistantMessage).toBe(renderAssistantMessage);
  });

  test('omits the internal scroll button accessory in preview', () => {
    renderer = renderWorkspace(true, [createMessage('user-1', 'user')]);

    expect(mockMessageListProps?.bottomAccessoryHeight).toBeUndefined();
    expect(mockMessageListProps?.contentBottomInset).toBe(12);
    expect(mockMessageListProps?.keyboardOffset).toBe(0);
    expect(mockMessageListProps?.renderAssistantMessage).toBeUndefined();
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

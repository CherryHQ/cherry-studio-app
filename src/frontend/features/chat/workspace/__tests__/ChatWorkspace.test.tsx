import type { Message } from '@cherrystudio/universal/data/types/message';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListProps } from '@/frontend/components/messagePresentation';

import { ChatWorkspace } from '../ChatWorkspace';

const mockInputHeightShared = {
  get: jest.fn(() => 80),
  set: jest.fn(),
  value: 80,
};
const mockLoadOlder = jest.fn(async () => undefined);
const mockRespondToolApproval = jest.fn(async () => undefined);
const mockInvalidateQueries = jest.fn(async () => undefined);
let mockCoverVisible: boolean | undefined;
let mockIsLoadingOlder: boolean | undefined;
let mockMessageListProps: MessageListProps | undefined;
let mockChatComposerProps:
  | {
      dismissKeyboardOnSend: boolean;
      onHeightChange: (height: number) => void;
      topicId: string;
    }
  | undefined;
let mockToolApprovalSheetProps:
  | {
      approvals: readonly { approvalId: string }[];
      isOpen: boolean;
      onRespond: (input: {
        approvalId: string;
        approved: boolean;
        messageId: string;
      }) => Promise<void>;
    }
  | undefined;
let mockChatTopic: {
  hasHistoryBeforePendingTurn?: boolean;
  overlayMessage?: Message;
  pendingUserMessage?: Message;
  status: string;
};

jest.mock('expo-router/react-navigation', () => ({
  useHeaderHeight: () => 52,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({ alert: { show: jest.fn() } }),
}));

jest.mock('@/frontend/components/composer', () => ({
  useComposerDockLayout: () => ({
    contentBottomInset: 96,
    handleInputHeightChange: jest.fn(),
    inputHeightShared: mockInputHeightShared,
    keyboardOffset: 26,
  }),
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
  ToolApprovalSheet: (props: NonNullable<typeof mockToolApprovalSheetProps>) => {
    mockToolApprovalSheetProps = props;
    return null;
  },
}));

jest.mock('../../runtime/ChatProvider', () => ({
  useChat: () => ({ respondToolApproval: mockRespondToolApproval }),
  useChatTopic: () => mockChatTopic,
}));

jest.mock('../components/ChatComposer', () => ({
  ChatComposer: (props: {
    dismissKeyboardOnSend: boolean;
    onHeightChange: (height: number) => void;
    topicId: string;
  }) => {
    mockChatComposerProps = props;
    return null;
  },
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

function renderWorkspace(isPreview: boolean, messages: readonly Message[]) {
  let renderer: ReactTestRenderer | undefined;

  act(() => {
    renderer = create(
      <ChatWorkspace
        isPreview={isPreview}
        messageWindow={{
          isLoadingInitial: false,
          isLoadingOlder: true,
          loadOlder: mockLoadOlder,
          messages,
        }}
        renderGateKey="topic-1:history"
        topicId="topic-1"
      />,
    );
  });

  return renderer;
}

describe('ChatWorkspace message presentation integration', () => {
  let renderer: ReactTestRenderer | undefined;
  let requestAnimationFrameSpy: jest.SpyInstance;
  let readyFrame: FrameRequestCallback | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChatComposerProps = undefined;
    mockChatTopic = { hasHistoryBeforePendingTurn: true, status: 'idle' };
    mockCoverVisible = undefined;
    mockIsLoadingOlder = undefined;
    mockMessageListProps = undefined;
    mockToolApprovalSheetProps = undefined;
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

  test('passes displayable messages, history loading, and composer layout on a normal page', () => {
    const pendingUserMessage = createMessage('user-pending', 'user');
    mockChatTopic.pendingUserMessage = pendingUserMessage;

    renderer = renderWorkspace(false, [
      createMessage('system-1', 'system'),
      createMessage('user-1', 'user'),
      createMessage('assistant-1', 'assistant'),
    ]);

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
    expect(mockChatComposerProps).toEqual(
      expect.objectContaining({ dismissKeyboardOnSend: false, topicId: 'topic-1' }),
    );
  });

  test('omits the composer and internal scroll button accessory in preview', () => {
    renderer = renderWorkspace(true, [createMessage('user-1', 'user')]);

    expect(mockMessageListProps?.bottomAccessoryHeight).toBeUndefined();
    expect(mockMessageListProps?.contentBottomInset).toBe(12);
    expect(mockMessageListProps?.keyboardOffset).toBe(0);
    expect(mockChatComposerProps).toBeUndefined();
  });

  test('passes the initial-ready callback through to the history render gate', () => {
    renderer = renderWorkspace(false, [createMessage('user-1', 'user')]);

    expect(mockCoverVisible).toBe(true);
    act(() => mockMessageListProps?.onReady?.());
    expect(readyFrame).toBeDefined();

    act(() => readyFrame?.(0));
    expect(mockCoverVisible).toBe(false);
  });

  test('refreshes an earlier approved provider after the final approval resumes the turn', async () => {
    const assistant = {
      ...createMessage('assistant-1', 'assistant'),
      data: {
        parts: [
          {
            approval: { approved: true, id: 'provider-approval' },
            input: {
              apiKey: '',
              baseUrl: '',
              intent: 'configure',
              manualModels: [],
              provider: 'cherryin',
              removedModelIds: [],
              selectedModelIds: [],
              skipModelPull: false,
            },
            state: 'approval-responded',
            toolCallId: 'provider-call',
            toolName: 'configure_builtin_provider',
            type: 'dynamic-tool',
          },
          {
            approval: { id: 'other-approval' },
            input: { query: 'status' },
            state: 'approval-requested',
            toolCallId: 'other-call',
            toolName: 'other_tool',
            type: 'dynamic-tool',
          },
        ],
      },
    } as unknown as Message;
    renderer = renderWorkspace(false, [createMessage('user-1', 'user'), assistant]);

    await act(async () => {
      await mockToolApprovalSheetProps?.onRespond({
        approvalId: 'other-approval',
        approved: true,
        messageId: 'assistant-1',
      });
    });

    expect(mockRespondToolApproval).toHaveBeenCalledWith({
      approvalId: 'other-approval',
      approved: true,
      messageId: 'assistant-1',
      topicId: 'topic-1',
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['/providers/cherryin'] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['/providers'] });
  });
});

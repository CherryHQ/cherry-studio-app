import type { Message } from '@cherrystudio/universal/data/types/message';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  AssistantReadAloudInput,
  MessageListProps,
} from '@/frontend/components/messagePresentation';

import { ChatWorkspace } from '../ChatWorkspace';

const mockInputHeightShared = {
  get: jest.fn(() => 80),
  set: jest.fn(),
  value: 80,
};
const mockLoadOlder = jest.fn(async () => undefined);
const mockRespondToolApproval = jest.fn(async () => undefined);
const mockRegenerate = jest.fn(async () => undefined);
const mockReadAloud = jest.fn((_input: AssistantReadAloudInput) => undefined);
const mockStopReadAloud = jest.fn(() => undefined);
const mockStopReadAloudIfActive = jest.fn(async (_messageId: string) => undefined);
const mockSetStringAsync = jest.fn(async (_text: string) => undefined);
const mockAlertShow = jest.fn();
const mockLoggerError = jest.fn();
const mockUseReplyReadAloud = jest.fn(
  (_options: { onError: () => void; topicId: string; visibleMessageIds: readonly string[] }) => ({
    activeMessageId: mockActiveReadAloudMessageId,
    readAloud: mockReadAloud,
    stopReadAloud: mockStopReadAloud,
    stopReadAloudIfActive: mockStopReadAloudIfActive,
  }),
);
let mockActiveReadAloudMessageId: string | undefined;
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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
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
    withContext: () => ({
      debug: jest.fn(),
      error: (...args: unknown[]) => mockLoggerError(...args),
    }),
  },
}));

jest.mock('../../approval/ToolApprovalSheet', () => ({
  ToolApprovalSheet: () => null,
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

jest.mock('../hooks/useReplyReadAloud', () => ({
  useReplyReadAloud: (options: {
    onError: () => void;
    topicId: string;
    visibleMessageIds: readonly string[];
  }) => mockUseReplyReadAloud(options),
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
  let copiedFeedbackCallback: (() => void) | undefined;
  let clearTimeoutSpy: jest.SpyInstance;
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegenerate.mockReset().mockResolvedValue(undefined);
    mockStopReadAloudIfActive.mockReset().mockResolvedValue(undefined);
    mockSetStringAsync.mockReset().mockResolvedValue(undefined);
    mockActiveReadAloudMessageId = 'assistant-1';
    mockChatComposerProps = undefined;
    mockChatTopic = {
      hasHistoryBeforePendingTurn: true,
      isBusy: false,
      regenerate: mockRegenerate,
      status: 'idle',
    };
    mockCoverVisible = undefined;
    mockIsLoadingOlder = undefined;
    mockMessageListProps = undefined;
    copiedFeedbackCallback = undefined;
    readyFrame = undefined;
    setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay) => {
      if (delay === 1_200 && typeof callback === 'function') {
        copiedFeedbackCallback = callback;
      }
      return 101 as unknown as ReturnType<typeof setTimeout>;
    });
    clearTimeoutSpy = jest.spyOn(global, 'clearTimeout').mockImplementation(() => undefined);
    requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        readyFrame = callback;
        return 1;
      });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    clearTimeoutSpy.mockRestore();
    requestAnimationFrameSpy.mockRestore();
    setTimeoutSpy.mockRestore();
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
    expect(mockUseReplyReadAloud).toHaveBeenLastCalledWith({
      onError: expect.any(Function),
      topicId: 'topic-1',
      visibleMessageIds: ['user-1', 'assistant-1', 'user-pending'],
    });
    expect(mockMessageListProps?.assistantActions).toEqual({
      activeReadAloudMessageId: 'assistant-1',
      copiedMessageId: undefined,
      isRegenerateDisabled: false,
      onCopy: expect.any(Function),
      onReadAloud: mockReadAloud,
      onRegenerate: expect.any(Function),
      onStopReadAloud: mockStopReadAloud,
    });
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
    expect(mockMessageListProps?.assistantActions).toBeUndefined();
    expect(mockChatComposerProps).toBeUndefined();
    expect(mockUseReplyReadAloud).toHaveBeenLastCalledWith({
      onError: expect.any(Function),
      topicId: 'topic-1',
      visibleMessageIds: ['user-1'],
    });
  });

  test('passes read-aloud commands through the assistant action contract', () => {
    renderer = renderWorkspace(false, [createMessage('assistant-1', 'assistant')]);
    const input = { language: 'zh-CN', messageId: 'assistant-1', text: '回答' };

    act(() => {
      mockMessageListProps?.assistantActions?.onReadAloud(input);
      mockMessageListProps?.assistantActions?.onStopReadAloud();
    });

    expect(mockReadAloud).toHaveBeenCalledWith(input);
    expect(mockStopReadAloud).toHaveBeenCalledTimes(1);
  });

  test('reports read-aloud failures with a title and description', () => {
    renderer = renderWorkspace(false, [createMessage('assistant-1', 'assistant')]);
    const hookOptions = mockUseReplyReadAloud.mock.calls.at(-1)?.[0];

    act(() => hookOptions?.onError());

    expect(mockAlertShow).toHaveBeenCalledWith({
      description: 'chat.messageActions.readAloudFailedDescription',
      title: 'chat.messageActions.readAloudFailed',
    });
  });

  test('copies visible text, reports feedback, and clears it after the timeout', async () => {
    renderer = renderWorkspace(false, [createMessage('assistant-1', 'assistant')]);

    await act(async () => {
      mockMessageListProps?.assistantActions?.onCopy({
        messageId: 'assistant-1',
        text: 'Visible answer',
      });
      await Promise.resolve();
    });

    expect(mockSetStringAsync).toHaveBeenCalledWith('Visible answer');
    expect(mockMessageListProps?.assistantActions?.copiedMessageId).toBe('assistant-1');

    act(() => copiedFeedbackCallback?.());
    expect(mockMessageListProps?.assistantActions?.copiedMessageId).toBeUndefined();
  });

  test('stops matching read aloud before regenerating the selected assistant message', async () => {
    renderer = renderWorkspace(false, [createMessage('assistant-1', 'assistant')]);

    await act(async () => {
      mockMessageListProps?.assistantActions?.onRegenerate('assistant-1');
      await Promise.resolve();
    });

    expect(mockStopReadAloudIfActive).toHaveBeenCalledWith('assistant-1');
    expect(mockRegenerate).toHaveBeenCalledWith({ messageId: 'assistant-1' });
    expect(mockStopReadAloudIfActive.mock.invocationCallOrder[0]).toBeLessThan(
      mockRegenerate.mock.invocationCallOrder[0],
    );
  });

  test('reports copy and regenerate failures through the shared alert', async () => {
    mockSetStringAsync.mockRejectedValueOnce(new Error('copy failed'));
    mockRegenerate.mockRejectedValueOnce(new Error('regenerate failed'));
    renderer = renderWorkspace(false, [createMessage('assistant-1', 'assistant')]);

    await act(async () => {
      mockMessageListProps?.assistantActions?.onCopy({
        messageId: 'assistant-1',
        text: 'Visible answer',
      });
      await Promise.resolve();
    });
    await act(async () => {
      mockMessageListProps?.assistantActions?.onRegenerate('assistant-1');
      await Promise.resolve();
    });

    expect(mockAlertShow).toHaveBeenCalledWith({ title: 'chat.messageActions.copyFailed' });
    expect(mockAlertShow).toHaveBeenCalledWith({
      title: 'chat.messageActions.regenerateFailed',
    });
    expect(mockLoggerError).toHaveBeenCalledTimes(2);
  });

  test('clears pending copied feedback when the workspace unmounts', async () => {
    renderer = renderWorkspace(false, [createMessage('assistant-1', 'assistant')]);
    await act(async () => {
      mockMessageListProps?.assistantActions?.onCopy({
        messageId: 'assistant-1',
        text: 'Visible answer',
      });
      await Promise.resolve();
    });

    act(() => renderer?.unmount());

    expect(clearTimeoutSpy).toHaveBeenCalledWith(101);
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

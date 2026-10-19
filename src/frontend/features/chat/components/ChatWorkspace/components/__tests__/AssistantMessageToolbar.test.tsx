import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { AssistantMessageActionsProvider } from '../../context/AssistantMessageActionsProvider';
import { copyAssistantMessageText } from '../../utils/copyAssistantMessageText';
import { AssistantMessageToolbar } from '../AssistantMessageToolbar';

jest.mock('../../translation/MessageTranslationProvider', () => ({
  useMessageTranslation: () => undefined,
  useMessageTranslationStore: () => null,
}));

const mockSetStringAsync = jest.fn(async (_text: string) => undefined);
const mockRetryMessage = jest.fn(async (_input: unknown): Promise<void> => undefined);
const mockShare = jest.fn();
const mockAnswerWith = jest.fn();
let mockIsSessionBusy = false;
const mockForkSession = jest.fn(async (_input: unknown) => undefined);
const mockDeleteTurn = jest.fn(async (_input: unknown): Promise<void> => undefined);
/** Captures the confirm request so a test can accept it the way a user would. */
const mockAlertConfirm = jest.fn<void, [{ onConfirm: () => void }]>();
const mockCopyAssistantMessageText = jest.mocked(copyAssistantMessageText);

jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
}));

jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/copy', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/git-fork', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/trash-2', () => () => null);

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    ActionMenu: ({ children, items }: { children: unknown; items: unknown }) =>
      createElement('ActionMenu', { items }, children),
    Button: (props: object) => createElement('Button', props),
    useAlert: () => ({ alert: { confirm: mockAlertConfirm } }),
    useToast: () => ({ toast: { show: jest.fn() } }),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ error: jest.fn() }),
  },
}));

jest.mock('@/frontend/components/ModelPicker', () => {
  const { createElement } = jest.requireActual('react');
  return { ModelPickerDrawer: (props: object) => createElement('ModelPickerDrawer', props) };
});

jest.mock('../../utils/copyAssistantMessageText', () => {
  const actual = jest.requireActual('../../utils/copyAssistantMessageText');
  return { ...actual, copyAssistantMessageText: jest.fn(actual.copyAssistantMessageText) };
});

describe('AssistantMessageToolbar', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSessionBusy = false;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test('disables retry while the session is busy', () => {
    mockIsSessionBusy = true;
    renderToolbar(createMessage('success', 'Old answer'));
    const retry = renderer!.root.findByProps({ testID: 'assistant-message-retry' });
    expect(retry.props.disabled).toBe(true);
    act(() => retry.props.onPress());
    expect(mockRetryMessage).not.toHaveBeenCalled();
  });

  test('offers no retry on an answer whose source cannot regenerate it', () => {
    renderToolbar(createMessage('success', 'Older answer'), false);

    expect(renderer?.root.findAllByProps({ testID: 'assistant-message-retry' })).toHaveLength(0);
    expect(
      renderer?.root.findAllByProps({ testID: 'assistant-message-fork' }).length,
    ).toBeGreaterThan(0);
  });

  test.each(['success', 'error', 'paused'] as const)(
    'retries a %s latest answer without creating a branch',
    async (status) => {
      renderToolbar(createMessage(status, 'Answer'));
      await act(async () => {
        renderer!.root.findByProps({ testID: 'assistant-message-retry' }).props.onPress();
      });
      expect(mockRetryMessage).toHaveBeenCalledWith({
        sessionId: 'session-1',
        messageId: 'assistant-1',
      });
      expect(mockForkSession).not.toHaveBeenCalled();
    },
  );

  test('stays hidden while the assistant message is pending', () => {
    renderToolbar(createMessage('pending', 'Answer'));

    expect(renderer?.root.findAllByType('Button')).toHaveLength(0);
    expect(mockCopyAssistantMessageText).not.toHaveBeenCalled();
  });

  test.each([
    { isVisible: false, status: 'pending' },
    { isVisible: true, status: 'success' },
    { isVisible: true, status: 'error' },
    { isVisible: true, status: 'paused' },
  ] satisfies { isVisible: boolean; status: MessageListItem['status'] }[])(
    'sets toolbar visibility to $isVisible for $status messages',
    ({ isVisible, status }) => {
      renderToolbar(createMessage(status, 'Answer'));

      const toolbarNodes = renderer?.root.findAllByProps({ testID: 'assistant-message-toolbar' });
      expect(Boolean(toolbarNodes?.length)).toBe(isVisible);
    },
  );

  test('copies projected text and exposes copied feedback for only this message', async () => {
    renderToolbar(createMessage('success', ' Answer '));
    const copyButton = renderer?.root.findByProps({ testID: 'assistant-message-copy' });

    expect(copyButton?.props.size).toBe('xs');
    expect(copyButton?.props.variant).toBe('ghost');
    expect(copyButton?.props.accessibilityLabel).toBe('common.copy');
    await act(async () => {
      copyButton?.props.onPress();
      await Promise.resolve();
    });

    expect(mockSetStringAsync).toHaveBeenCalledWith('Answer');
    expect(
      renderer?.root.findByProps({ testID: 'assistant-message-copy' }).props.accessibilityLabel,
    ).toBe('chat.messageActions.copied');
    expect(
      renderer?.root.findByProps({ testID: 'assistant-message-copy' }).props.icon.props.className,
    ).toBe('text-success');
  });

  test('keeps the direct branch action reachable on a message with nothing to copy', () => {
    renderToolbar(createMessage('success', '   '));

    expect(renderer?.root.findAllByProps({ testID: 'assistant-message-copy' })).toHaveLength(0);
    expect(
      renderer?.root.findAllByProps({ testID: 'assistant-message-toolbar' }).length,
    ).toBeGreaterThan(0);
    expect(
      renderer?.root.findAllByProps({ testID: 'assistant-message-fork' }).length,
    ).toBeGreaterThan(0);
  });

  test('forks this message from the direct branch button', () => {
    renderToolbar(createMessage('success', 'Answer'));

    const forkButton = renderer!.root.findByProps({ testID: 'assistant-message-fork' });
    expect(forkButton.props).toMatchObject({
      accessibilityLabel: 'chat.messageActions.fork',
      size: 'xs',
      variant: 'ghost',
    });

    act(() => forkButton.props.onPress());
    expect(mockForkSession).toHaveBeenCalledWith({
      fromMessageId: 'assistant-1',
      sessionId: 'session-1',
      title: 'chat.fork.sessionTitle',
    });
  });

  test("deletes the pressed answer's whole turn after a destructive confirmation", async () => {
    renderToolbar({ ...createMessage('success', 'Answer'), turnId: 'turn-1' });

    const deleteItem = menuItem('delete');
    expect(deleteItem).toMatchObject({
      destructive: true,
      disabled: false,
      label: 'common.delete',
    });

    act(() => deleteItem?.onPress());
    expect(mockDeleteTurn).not.toHaveBeenCalled();

    await act(async () => {
      mockAlertConfirm.mock.lastCall![0].onConfirm();
      await Promise.resolve();
    });
    expect(mockDeleteTurn).toHaveBeenCalledWith({ sessionId: 'session-1', turnId: 'turn-1' });
  });

  test('disables delete while the session is busy', () => {
    mockIsSessionBusy = true;
    renderToolbar({ ...createMessage('success', 'Answer'), turnId: 'turn-1' });

    expect(menuItem('delete')?.disabled).toBe(true);
  });

  test('offers no delete on a row that carries no turn', () => {
    renderToolbar(createMessage('success', 'Answer'));

    expect(menuItem('delete')).toBeUndefined();
  });

  test('keeps sharing in the more menu', () => {
    renderToolbar(createMessage('success', 'Answer'));

    expect(menuItem('translate')).toBeUndefined();
    act(() => menuItem('share')?.onPress());
    expect(mockShare).toHaveBeenCalledWith('assistant-1', undefined);
  });

  test('adds an answer from the model chosen with @', async () => {
    renderToolbar(createMessage('error', 'Answer'));
    expect(renderer?.root.findAllByType('ModelPickerDrawer' as never)).toHaveLength(0);

    act(() =>
      renderer!.root.findByProps({ testID: 'assistant-message-answer-with' }).props.onPress(),
    );
    const picker = renderer!.root.findByType('ModelPickerDrawer' as never);
    expect(picker.props).toMatchObject({
      modelType: 'text',
      selectedModelId: 'qwen::qwen3-max',
      title: 'chat.messageActions.answerWith',
    });
    await act(async () => {
      picker.props.onSelect({ modelId: 'openai::gpt-5' });
    });

    expect(mockAnswerWith).toHaveBeenCalledWith({ modelId: 'openai::gpt-5' });
    expect(mockRetryMessage).not.toHaveBeenCalled();
    expect(renderer?.root.findAllByType('ModelPickerDrawer' as never)).toHaveLength(0);
  });

  test('disables @ while the session is busy', () => {
    mockIsSessionBusy = true;
    renderToolbar(createMessage('success', 'Answer'));

    const answerWith = renderer!.root.findByProps({ testID: 'assistant-message-answer-with' });
    expect(answerWith.props.disabled).toBe(true);
    act(() => answerWith.props.onPress());
    expect(renderer?.root.findAllByType('ModelPickerDrawer' as never)).toHaveLength(0);
  });

  function menuItem(id: string) {
    return (
      renderer!.root.findByType('ActionMenu' as never).props.items as {
        destructive?: boolean;
        disabled?: boolean;
        id: string;
        label: string;
        onPress: () => void;
      }[]
    ).find((item) => item.id === id);
  }

  function renderToolbar(message: MessageListItem, retryable = true) {
    act(() => {
      renderer = create(
        <AssistantMessageActionsProvider
          isAssistantToolbarEnabled
          onShare={mockShare}
          snapshot={{
            title: 'Arithmetic drills',
            freshness: { state: 'current' },
            liveMessages: [],
            interactions: [],
            executions: mockIsSessionBusy ? [{ id: 'turn', state: 'running' }] : [],
          }}
          messages={[
            {
              key: message.id,
              state: 'success',
              completeness: 'complete',
              display: message,
              actions: {
                ...(retryable
                  ? {
                      answerWith: {
                        availability: { state: 'enabled' as const },
                        execute: async (input: { modelId: string }) => {
                          mockAnswerWith(input);
                          return { state: 'applied' as const, value: undefined };
                        },
                      },
                      retry: {
                        availability: { state: 'enabled' as const },
                        execute: async () => {
                          await mockRetryMessage({ sessionId: 'session-1', messageId: message.id });
                          return { state: 'applied' as const, value: undefined };
                        },
                      },
                    }
                  : {}),
                fork: {
                  availability: { state: 'enabled' },
                  execute: async ({ title }) => {
                    await mockForkSession({
                      fromMessageId: message.id,
                      sessionId: 'session-1',
                      title,
                    });
                    return {
                      state: 'applied',
                      value: { source: { kind: 'local' }, sessionId: 'fork' },
                    };
                  },
                },
                remove: {
                  availability: { state: 'enabled' },
                  execute: async () => {
                    await mockDeleteTurn({ sessionId: 'session-1', turnId: message.turnId });
                    return { state: 'applied', value: undefined };
                  },
                },
              },
            },
          ]}
        >
          <AssistantMessageToolbar message={message} />
        </AssistantMessageActionsProvider>,
      );
    });
  }
});

function createMessage(status: MessageListItem['status'], text: string): MessageListItem {
  return {
    data: { parts: [{ text, type: 'text' }] },
    id: 'assistant-1',
    model: { id: 'qwen::qwen3-max', modelId: 'qwen3-max', name: 'Qwen3 Max', providerId: 'qwen' },
    role: 'assistant',
    status,
  };
}

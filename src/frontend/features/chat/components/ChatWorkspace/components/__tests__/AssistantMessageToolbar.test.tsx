import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { AssistantMessageActionsProvider } from '../../context/AssistantMessageActionsProvider';
import { copyAssistantMessageText } from '../../utils/copyAssistantMessageText';
import { AssistantMessageToolbar } from '../AssistantMessageToolbar';

const mockSetStringAsync = jest.fn(async (_text: string) => undefined);
const mockForkSession = jest.fn(async (_input: unknown) => undefined);
const mockCopyAssistantMessageText = jest.mocked(copyAssistantMessageText);

jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/copy', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/git-fork', () => () => null);

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    Button: (props: object) => createElement('Button', props),
    useToast: () => ({ toast: { show: jest.fn() } }),
  };
});

jest.mock('../../../../runtime', () => ({
  useAgentChatFork: () => mockForkSession,
}));

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentSession: () => ({ data: { title: 'Arithmetic drills' } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ error: jest.fn() }),
  },
}));

jest.mock('../../utils/copyAssistantMessageText', () => {
  const actual = jest.requireActual('../../utils/copyAssistantMessageText');
  return { ...actual, copyAssistantMessageText: jest.fn(actual.copyAssistantMessageText) };
});

describe('AssistantMessageToolbar', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

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

  function renderToolbar(message: MessageListItem) {
    act(() => {
      renderer = create(
        <AssistantMessageActionsProvider isAssistantToolbarEnabled sessionId="session-1">
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
    role: 'assistant',
    status,
  };
}

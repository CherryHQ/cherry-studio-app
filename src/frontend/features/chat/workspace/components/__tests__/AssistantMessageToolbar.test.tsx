import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessagePresentationItem } from '@/frontend/components/messagePresentation';

import { AssistantMessageActionsProvider } from '../../context/AssistantMessageActionsProvider';
import { copyAssistantMessageText } from '../../utils/copyAssistantMessageText';
import { AssistantMessageToolbar } from '../AssistantMessageToolbar';

const mockSetStringAsync = jest.fn(async (_text: string) => undefined);
const mockCopyAssistantMessageText = jest.mocked(copyAssistantMessageText);

jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

jest.mock('@cherrystudio/app-icons', () => ({
  CheckIcon: () => null,
  CopyIcon: () => null,
  RefreshCwIcon: () => null,
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return { Button: (props: object) => createElement('Button', props) };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({ alert: { show: jest.fn() } }),
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
  const onRegenerate = jest.fn(async (_input: { messageId: string }) => undefined);

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
  ] satisfies { isVisible: boolean; status: MessagePresentationItem['status'] }[])(
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

    expect(copyButton?.props.accessibilityLabel).toBe('common.copy');
    await act(async () => {
      copyButton?.props.onPress();
      await Promise.resolve();
    });

    expect(mockSetStringAsync).toHaveBeenCalledWith('Answer');
    expect(
      renderer?.root.findByProps({ testID: 'assistant-message-copy' }).props.accessibilityLabel,
    ).toBe('chat.messageActions.copied');
  });

  test('keeps regenerate available without copyable text and reflects busy state', () => {
    renderToolbar(createMessage('success', '   '), true);

    expect(renderer?.root.findAllByProps({ testID: 'assistant-message-copy' })).toHaveLength(0);
    expect(
      renderer?.root.findByProps({ testID: 'assistant-message-regenerate' }).props.disabled,
    ).toBe(true);
  });

  test('regenerates this message with an accessible action', () => {
    renderToolbar(createMessage('success', 'Answer'));
    const regenerateButton = renderer?.root.findByProps({
      testID: 'assistant-message-regenerate',
    });

    expect(regenerateButton?.props.accessibilityLabel).toBe('chat.messageActions.regenerate');
    act(() => regenerateButton?.props.onPress());

    expect(onRegenerate).toHaveBeenCalledWith({ messageId: 'assistant-1' });
  });

  function renderToolbar(message: MessagePresentationItem, isRegenerateDisabled = false) {
    act(() => {
      renderer = create(
        <AssistantMessageActionsProvider
          isRegenerateDisabled={isRegenerateDisabled}
          onRegenerate={onRegenerate}
        >
          <AssistantMessageToolbar message={message} />
        </AssistantMessageActionsProvider>,
      );
    });
  }
});

function createMessage(
  status: MessagePresentationItem['status'],
  text: string,
): MessagePresentationItem {
  return {
    data: { parts: [{ text, type: 'text' }] },
    id: 'assistant-1',
    role: 'assistant',
    status,
  };
}

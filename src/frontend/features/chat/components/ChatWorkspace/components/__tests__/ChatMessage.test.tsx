import type { ContextMenuProps } from '@cherrystudio/ui/components';
import type { ReactElement, ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { ChatMessage } from '../ChatMessage';

const mockContextMenu = jest.fn(({ children }: ContextMenuProps) => children);
const mockCopyMessage = jest.fn();
const mockDeleteMessageTurn = jest.fn();
const mockShareMessage = jest.fn();
const mockLocalUsage = jest.fn(() => null);

jest.mock('@cherrystudio/ui/components', () => ({
  BackgroundPressExclusion: ({ children }: { children: ReactNode }) => children,
  Button: (props: object) => jest.requireActual('react').createElement('Button', props),
  ContextMenu: (props: ContextMenuProps) => mockContextMenu(props),
  ContextMenuExclusion: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('../../context/AssistantMessageActionsProvider', () => ({
  useAssistantMessageActions: () => ({
    copyAssistantMessage: mockCopyMessage,
    deleteMessageTurn: mockDeleteMessageTurn,
    shareAssistantMessage: mockShareMessage,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/Avatar', () => {
  const { createElement } = jest.requireActual('react');
  return {
    AgentAvatar: () => null,
    ModelAvatar: (props: object) =>
      createElement('ModelAvatar', { ...props, testID: 'assistant-message-model-avatar' }),
  };
});

jest.mock('@/frontend/components/Message', () => {
  const { createElement } = jest.requireActual('react');
  return {
    AssistantMessage: ({ children, ...props }: { children: ReactNode }) =>
      createElement('AssistantMessage', props, children),
    UserMessage: () => createElement('UserMessage', null),
  };
});

jest.mock('../AssistantMessageToolbar', () => ({
  AssistantMessageToolbar: () => null,
}));

jest.mock('../AssistantMessageUsage', () => ({
  AssistantMessageUsage: () => mockLocalUsage(),
}));

describe('ChatMessage', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('only displays usage supplied by the conversation owner, without reading the local ledger by default', () => {
    act(() => {
      renderer = create(renderMessage(createMessage('success')));
    });
    expect(mockLocalUsage).not.toHaveBeenCalled();
    act(() => {
      renderer!.update(
        <ChatMessage
          assistantPresentation={{ name: 'Assistant' }}
          isMessageActionsEnabled
          shouldShowTimestamp
          message={createMessage('success')}
          usage="42 Tokens"
        />,
      );
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain('42 Tokens');
    expect(mockLocalUsage).not.toHaveBeenCalled();
  });

  test('enables copy and share only after an assistant answer settles', () => {
    act(() => {
      renderer = create(renderMessage(createMessage('pending')));
    });

    expect(mockContextMenu.mock.lastCall?.[0].items).toEqual([]);

    act(() => {
      renderer?.update(renderMessage(createMessage('success')));
    });

    const menu = mockContextMenu.mock.lastCall![0];
    expect(menu.items.map((item) => item.id)).toEqual(['copy', 'share']);
    act(() => menu.items[0].onPress());
    expect(mockCopyMessage).toHaveBeenCalledWith({ messageId: 'assistant-1', text: 'Answer' });
    act(() => menu.items[1].onPress());
    expect(mockShareMessage).toHaveBeenCalledWith({ messageId: 'assistant-1' });
  });

  test('copies user text and shares the selected user message through the existing actions', () => {
    act(() => {
      renderer = create(
        renderMessage({
          ...createMessage('success'),
          data: { parts: [{ type: 'text', text: 'My question' }] },
          id: 'user-1',
          role: 'user',
        }),
      );
    });

    const menu = mockContextMenu.mock.lastCall![0];
    act(() => menu.items[0].onPress());
    expect(mockCopyMessage).toHaveBeenCalledWith({ messageId: 'user-1', text: 'My question' });
    act(() => menu.items[1].onPress());
    expect(mockShareMessage).toHaveBeenCalledWith({ messageId: 'user-1' });
  });

  test('disables copy when the message has no copyable text but still allows sharing', () => {
    act(() => {
      renderer = create(renderMessage({ ...createMessage('success'), data: { parts: [] } }));
    });

    const menu = mockContextMenu.mock.lastCall![0];
    expect(menu.items[0].disabled).toBe(true);
    act(() => menu.items[1].onPress());
    expect(mockShareMessage).toHaveBeenCalledWith({ messageId: 'assistant-1' });
  });

  test('offers independently operable user actions when a screen reader is enabled', () => {
    const message: MessageListItem = { ...createMessage('success'), id: 'user-1', role: 'user' };
    act(() => {
      renderer = create(renderMessage(message, true, true));
    });

    const copy = renderer!.root.findByProps({ testID: 'user-message-copy' });
    const share = renderer!.root.findByProps({ testID: 'user-message-share' });
    act(() => copy.props.onPress());
    act(() => share.props.onPress());
    expect(mockCopyMessage).toHaveBeenCalledWith({ messageId: 'user-1', text: 'Answer' });
    expect(mockShareMessage).toHaveBeenCalledWith({ messageId: 'user-1' });
    // Grouping the complete row would hide its attachment controls from VoiceOver.
    const menuContent = mockContextMenu.mock.lastCall![0].children as ReactElement<{
      accessible: boolean;
    }>;
    expect(menuContent.props.accessible).toBe(false);

    act(() => renderer?.update(renderMessage(message, true, false)));
    expect(renderer!.root.findAllByType('Button')).toHaveLength(0);
  });

  test('keeps attachment-only user messages shareable without an empty copy action', () => {
    act(() => {
      renderer = create(
        renderMessage(
          {
            ...createMessage('success'),
            id: 'user-attachment',
            role: 'user',
            data: { parts: [{ type: 'file', mediaType: 'image/png', url: 'file:///image.png' }] },
          },
          true,
          true,
        ),
      );
    });

    expect(renderer!.root.findAllByProps({ testID: 'user-message-copy' })).toHaveLength(0);
    act(() => renderer!.root.findByProps({ testID: 'user-message-share' }).props.onPress());
    expect(mockShareMessage).toHaveBeenCalledWith({ messageId: 'user-attachment' });
  });

  test.each([
    ['pending', 'user', true],
    ['success', 'user', false],
    ['success', 'assistant', true],
  ] as const)('does not add a user toolbar for %s / %s / actions=%s', (status, role, enabled) => {
    act(() => {
      renderer = create(renderMessage({ ...createMessage(status), role }, enabled, true));
    });
    expect(renderer!.root.findAllByType('Button')).toHaveLength(0);
  });

  test('keeps the long-press menu free of destructive actions', () => {
    act(() => {
      renderer = create(renderMessage({ ...createMessage('success'), turnId: 'turn-1' }));
    });

    // Deleting a turn lives on the assistant toolbar. A long press competes
    // with native text selection and lands wherever the finger reaches, so it
    // must not be able to remove anything.
    const items = mockContextMenu.mock.lastCall![0].items;
    expect(items.map((item) => item.id)).toEqual(['copy', 'share']);
    expect(items.some((item) => item.destructive)).toBe(false);
    expect(mockDeleteMessageTurn).not.toHaveBeenCalled();
  });

  test('keeps native text selection available when message actions are disabled', () => {
    act(() => {
      renderer = create(renderMessage(createMessage('success'), false));
    });

    expect(mockContextMenu).not.toHaveBeenCalled();
  });

  test('shows the local creation time separately from the model identity', () => {
    act(() => {
      renderer = create(
        renderMessage({
          ...createMessage('success'),
          createdAt: '2026-08-28T15:02:00',
          model: {
            id: 'qwen::qwen3.8-max-preview',
            modelId: 'qwen3.8-max-preview',
            name: 'Qwen3.8 Max Preview',
            providerId: 'qwen',
          },
        }),
      );
    });

    expect(renderer?.root.findByProps({ testID: 'chat-message-time' }).props.children).toBe(
      '08/28 15:02',
    );
    expect(
      renderer?.root.findByProps({ testID: 'assistant-message-model-avatar' }).props.model,
    ).toMatchObject({
      modelId: 'qwen3.8-max-preview',
      name: 'Qwen3.8 Max Preview',
      providerId: 'qwen',
    });
  });
});

function renderMessage(
  message: MessageListItem,
  isMessageActionsEnabled = true,
  isScreenReaderEnabled = false,
) {
  return (
    <ChatMessage
      assistantPresentation={{ name: 'Assistant' }}
      isMessageActionsEnabled={isMessageActionsEnabled}
      isScreenReaderEnabled={isScreenReaderEnabled}
      message={message}
      shouldShowTimestamp
    />
  );
}

function createMessage(status: MessageListItem['status']): MessageListItem {
  return {
    data: { parts: [{ text: 'Answer', type: 'text' }] },
    id: 'assistant-1',
    role: 'assistant',
    status,
  };
}

import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/messages';

import { ChatMessage } from '../ChatMessage';

const mockCopyAssistantMessage = jest.fn();
let mockMenuItems: readonly { disabled?: boolean; id: string }[] = [];

jest.mock('@cherrystudio/ui/components', () => ({
  ContextMenu: ({ children, items }: { children: ReactNode; items: typeof mockMenuItems }) => {
    mockMenuItems = items;
    return children;
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/avatar', () => {
  const { createElement } = jest.requireActual('react');
  return {
    AgentAvatar: () => null,
    ModelAvatar: (props: object) =>
      createElement('ModelAvatar', { ...props, testID: 'assistant-message-model-avatar' }),
  };
});

jest.mock('@/frontend/components/messages', () => {
  const { createElement } = jest.requireActual('react');
  return {
    AssistantMessage: ({ children, ...props }: { children: ReactNode }) =>
      createElement('AssistantMessage', props, children),
    UserMessage: () => createElement('UserMessage', null),
  };
});

jest.mock('../../context/AssistantMessageActionsProvider', () => ({
  useAssistantMessageActions: () => ({ copyAssistantMessage: mockCopyAssistantMessage }),
}));

jest.mock('../AssistantMessageToolbar', () => ({
  AssistantMessageToolbar: () => null,
}));

describe('ChatMessage', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('keeps the long-press menu mounted while copy changes from unavailable to available', () => {
    act(() => {
      renderer = create(renderMessage(createMessage('pending')));
    });

    expect(mockMenuItems).toMatchObject([{ disabled: true, id: 'copy' }]);

    act(() => {
      renderer?.update(renderMessage(createMessage('success')));
    });

    expect(mockMenuItems).toMatchObject([{ disabled: false, id: 'copy' }]);
    expect(renderer?.root.findByType('AssistantMessage').props.isTextSelectionEnabled).toBe(false);
  });

  test('keeps native text selection available when message actions are disabled', () => {
    act(() => {
      renderer = create(renderMessage(createMessage('success'), false));
    });

    expect(renderer?.root.findByType('AssistantMessage').props.isTextSelectionEnabled).toBe(true);
    expect(mockMenuItems).toEqual([]);
  });

  test('shows the model identity and local creation time for the individual message', () => {
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

    expect(renderer?.root.findByProps({ testID: 'assistant-message-time' }).props.children).toBe(
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

function renderMessage(message: MessageListItem, isMessageActionsEnabled = true) {
  return (
    <ChatMessage
      assistantPresentation={{ name: 'Assistant' }}
      isMessageActionsEnabled={isMessageActionsEnabled}
      message={message}
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

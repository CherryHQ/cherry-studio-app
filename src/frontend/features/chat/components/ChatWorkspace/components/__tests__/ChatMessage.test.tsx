import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { ChatMessage } from '../ChatMessage';

const mockContextMenu = jest.fn(({ children }: { children: ReactNode }) => children);

jest.mock('@cherrystudio/ui/components', () => ({
  ContextMenu: (props: { children: ReactNode }) => mockContextMenu(props),
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
  AssistantMessageUsage: () => null,
}));

describe('ChatMessage', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockContextMenu.mockClear();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('does not attach a long-press menu before or after an assistant answer settles', () => {
    act(() => {
      renderer = create(renderMessage(createMessage('pending')));
    });

    expect(mockContextMenu).not.toHaveBeenCalled();

    act(() => {
      renderer?.update(renderMessage(createMessage('success')));
    });

    expect(mockContextMenu).not.toHaveBeenCalled();
    expect(renderer?.root.findByType('AssistantMessage').props.isTextSelectionEnabled).toBe(false);
  });

  test('does not attach a long-press menu to user messages', () => {
    act(() => {
      renderer = create(renderMessage({ ...createMessage('success'), role: 'user' }));
    });

    expect(mockContextMenu).not.toHaveBeenCalled();
  });

  test('keeps native text selection available when message actions are disabled', () => {
    act(() => {
      renderer = create(renderMessage(createMessage('success'), false));
    });

    expect(renderer?.root.findByType('AssistantMessage').props.isTextSelectionEnabled).toBe(true);
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

function renderMessage(message: MessageListItem, isMessageActionsEnabled = true) {
  return (
    <ChatMessage
      assistantPresentation={{ name: 'Assistant' }}
      isMessageActionsEnabled={isMessageActionsEnabled}
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

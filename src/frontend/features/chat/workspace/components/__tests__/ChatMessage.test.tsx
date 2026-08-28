import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/messages';

import { ChatMessage } from '../ChatMessage';

const mockCopyAssistantMessage = jest.fn();
let mockMenuItems: readonly { disabled?: boolean; id: string }[] = [];

jest.mock('@cherrystudio/ui/components', () => ({
  Menu: ({ children, items }: { children: ReactNode; items: typeof mockMenuItems }) => {
    mockMenuItems = items;
    return children;
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/avatar', () => ({
  AgentAvatar: () => null,
}));

jest.mock('@/frontend/components/messages', () => {
  const { createElement } = jest.requireActual('react');
  return {
    AssistantMessage: ({ children }: { children: ReactNode }) =>
      createElement('AssistantMessage', null, children),
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
  });
});

function renderMessage(message: MessageListItem) {
  return (
    <ChatMessage
      assistantPresentation={{ name: 'Assistant' }}
      isMessageActionsEnabled
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

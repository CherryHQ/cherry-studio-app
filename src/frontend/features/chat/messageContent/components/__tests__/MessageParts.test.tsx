import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Message, MessageStatus } from '@/shared/data/types/message';

import { MessageParts } from '../MessageParts';

jest.mock('../MessagePart', () => {
  const { createElement } = jest.requireActual('react');

  return {
    MessagePart: (props: object) => createElement('MessagePart', props),
  };
});

describe('MessageParts', () => {
  test.each([
    ['pending', true],
    ['success', false],
    ['error', false],
    ['paused', false],
  ] as const)('status=%s passes isStreaming=%p', (status, isStreaming) => {
    const renderer = render(<MessageParts message={makeMessage(status)} />);

    expect(renderer.root.findByType('MessagePart').props.isStreaming).toBe(isStreaming);
  });
});

function render(element: ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) {
    throw new Error('Renderer was not created');
  }
  return renderer;
}

function makeMessage(status: MessageStatus): Message {
  return {
    data: { parts: [{ text: 'Hello', type: 'text' }] },
    id: 'message-1',
    status,
  } as Message;
}

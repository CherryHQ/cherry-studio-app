import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageStatus } from '@/shared/data/types/message';

import type { MessageListItem } from '../../types';
import { MessageParts } from '../MessageParts';

jest.mock('../MessagePartRenderer', () => {
  const { createElement } = jest.requireActual('react');

  return {
    MessagePartRenderer: (props: object) => createElement('MessagePartRenderer', props),
  };
});

jest.mock('../SourceGroup', () => {
  const { createElement } = jest.requireActual('react');

  return {
    SourceGroup: (props: object) => createElement('SourceGroup', props),
  };
});

describe('MessageParts', () => {
  test.each([
    ['pending', true],
    ['success', false],
    ['error', false],
    ['paused', false],
  ] as const)('status=%s passes isStreaming=%p', (status, isStreaming) => {
    const renderer = render(<MessageParts isTextSelectionEnabled message={makeMessage(status)} />);

    expect(renderer.root.findByType('MessagePartRenderer').props.isStreaming).toBe(isStreaming);
    expect(renderer.root.findByType('MessagePartRenderer').props.isTextSelectionEnabled).toBe(true);
    expect(renderer.root.findByType('MessagePartRenderer').props.resolvedText).toBeUndefined();
  });

  test('keeps source parts out of the ordered renderers and groups them once', () => {
    const source = {
      sourceId: 'source-1',
      title: 'Cherry Studio',
      type: 'source-url' as const,
      url: 'https://cherry-ai.com',
    };
    const message: MessageListItem = {
      ...makeMessage('success'),
      data: { parts: [{ text: 'Hello', type: 'text' }, source] },
    };
    const renderer = render(<MessageParts isTextSelectionEnabled={false} message={message} />);

    const renderedPart = renderer.root.findByType('MessagePartRenderer');
    expect(renderedPart.props.part).toEqual({ text: 'Hello', type: 'text' });
    expect(renderedPart.props.isTextSelectionEnabled).toBe(false);
    expect(renderer.root.findByType('SourceGroup').props.parts).toEqual([source]);
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

function makeMessage(status: MessageStatus): MessageListItem {
  return {
    data: { parts: [{ text: 'Hello', type: 'text' }] },
    id: 'message-1',
    role: 'assistant',
    status,
  };
}

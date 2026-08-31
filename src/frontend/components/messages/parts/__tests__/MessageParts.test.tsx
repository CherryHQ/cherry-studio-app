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

jest.mock('../ArtifactGroup', () => {
  const { createElement } = jest.requireActual('react');

  return {
    ArtifactGroup: (props: object) => createElement('ArtifactGroup', props),
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

  test('keeps source and artifact parts out of ordered renderers and groups each once', () => {
    const source = {
      sourceId: 'source-1',
      title: 'Cherry Studio',
      type: 'source-url' as const,
      url: 'https://cherry-ai.com',
    };
    const message: MessageListItem = {
      ...makeMessage('success'),
      data: {
        parts: [
          { text: 'Hello', type: 'text' },
          {
            filename: 'report.md',
            mediaType: 'text/markdown',
            providerMetadata: {
              cherry: { fileEntryId: 'file-1', purpose: 'artifact' },
            },
            type: 'file',
            url: 'cherry://file/file-1',
          },
          source,
        ],
      },
    };
    const renderer = render(<MessageParts isTextSelectionEnabled={false} message={message} />);

    const renderedPart = renderer.root.findByType('MessagePartRenderer');
    expect(renderedPart.props.part).toEqual({ text: 'Hello', type: 'text' });
    expect(renderedPart.props.isTextSelectionEnabled).toBe(false);
    expect(renderer.root.findByType('ArtifactGroup').props.parts).toEqual([
      expect.objectContaining({ filename: 'report.md', type: 'file' }),
    ]);
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

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

jest.mock('../MessageFileStrip', () => {
  const { createElement } = jest.requireActual('react');

  return {
    MessageFileStrip: (props: object) => createElement('MessageFileStrip', props),
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

  test('collects files into one strip and groups sources once', () => {
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
          makeFilePart('file-1', 'report.md'),
          makeFilePart('file-2', 'summary.md'),
          source,
        ],
      },
    };
    const renderer = render(<MessageParts isTextSelectionEnabled={false} message={message} />);

    const renderedPart = renderer.root.findByType('MessagePartRenderer');
    expect(renderedPart.props.part).toEqual({ text: 'Hello', type: 'text' });
    expect(renderedPart.props.isTextSelectionEnabled).toBe(false);
    expect(renderer.root.findByType('MessageFileStrip').props.parts).toEqual([
      expect.objectContaining({ filename: 'report.md' }),
      expect.objectContaining({ filename: 'summary.md' }),
    ]);
    expect(renderer.root.findByType('SourceGroup').props.parts).toEqual(message.data.parts);
  });

  test('shows a file produced mid-answer after the answer, not where it interrupted it', () => {
    const message: MessageListItem = {
      ...makeMessage('success'),
      data: {
        parts: [
          { text: 'Here it is', type: 'text' },
          makeFilePart('file-1', 'chart.png'),
          { text: 'and a revision', type: 'text' },
        ],
      },
    };
    const renderer = render(<MessageParts isTextSelectionEnabled={false} message={message} />);
    const rendered = renderer.root.findAll(
      (node) => node.type === 'MessagePartRenderer' || node.type === 'MessageFileStrip',
    );

    expect(rendered.map((node) => node.type)).toEqual([
      'MessagePartRenderer',
      'MessagePartRenderer',
      'MessageFileStrip',
    ]);
  });
});

function makeFilePart(fileEntryId: string, filename: string) {
  return {
    filename,
    mediaType: 'text/markdown',
    providerMetadata: { cherry: { fileEntryId } },
    type: 'file' as const,
    url: `cherry://file/${fileEntryId}`,
  };
}

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

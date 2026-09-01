import type { ReactElement } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import type { MessageListItem } from '../../types';
import { UserMessage } from '../UserMessage';

jest.mock('../../parts/FilePart', () => {
  const { createElement } = jest.requireActual('react');

  return {
    FilePart: (props: object) => createElement('FilePart', props),
  };
});

jest.mock('../../parts/MessageParts', () => {
  const { createElement } = jest.requireActual('react');

  return {
    MessageParts: (props: object) => createElement('MessageParts', props),
  };
});

describe('UserMessage', () => {
  test('keeps a text-only message in the bubble', () => {
    const message = createMessage([textPart('Hello')]);
    const renderer = render(<UserMessage message={message} />);

    expect(renderer.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(renderer.root.findByType('MessageParts').props).toEqual(
      expect.objectContaining({ message, renderMode: 'plainText' }),
    );
  });

  test('renders managed attachments above the independent text bubble', () => {
    const first = managedFilePart('first.png', '00000000-0000-7000-8000-000000000001');
    const second = managedFilePart('second.pdf', '00000000-0000-7000-8000-000000000002');
    const message = createMessage([textPart('Hello'), first, second]);
    const renderer = render(<UserMessage message={message} />);
    const scrollView = renderer.root.findByType(ScrollView);
    const attachmentContainer = renderer.root.findByProps({ className: 'max-w-full self-end' });
    const renderedContent = renderer.root.findAll(
      (node) => node.type === 'FilePart' || node.type === 'MessageParts',
    );

    expect(scrollView.props.horizontal).toBe(true);
    expect(scrollView.props.showsHorizontalScrollIndicator).toBe(false);
    // The row owns its own height; the wrapper only pins it to the user column.
    expect(attachmentContainer).toBeDefined();
    expect(StyleSheet.flatten(scrollView.props.style)?.height).toBe(112);
    expect(renderer.root.findAllByType('FilePart').map((node) => node.props.part)).toEqual([
      first,
      second,
    ]);
    expect(renderedContent.map((node) => node.type)).toEqual([
      'FilePart',
      'FilePart',
      'MessageParts',
    ]);
    expect(renderer.root.findByType('MessageParts').props.message.data.parts).toEqual([
      message.data.parts?.[0],
    ]);
  });

  test('keeps attachment-only messages without an empty bubble', () => {
    const message = createMessage([
      managedFilePart('photo.png', '00000000-0000-7000-8000-000000000003'),
    ]);
    const renderer = render(<UserMessage message={message} />);

    expect(renderer.root.findAllByType('FilePart')).toHaveLength(1);
    expect(renderer.root.findAllByType('MessageParts')).toHaveLength(0);
    expect(
      renderer.root.findAll(
        (node) =>
          node.type === View &&
          typeof node.props.className === 'string' &&
          node.props.className.includes('bg-chat-user'),
      ),
    ).toHaveLength(0);
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

function createMessage(parts: CherryMessagePart[]): MessageListItem {
  return {
    data: { parts },
    id: '00000000-0000-7000-8000-000000000010',
    role: 'user',
    status: 'success',
  };
}

function textPart(text: string): CherryMessagePart {
  return { text, type: 'text' };
}

function managedFilePart(filename: string, fileEntryId: string): CherryMessagePart {
  return {
    filename,
    mediaType: filename.endsWith('.png') ? 'image/png' : 'application/pdf',
    providerMetadata: { cherry: { fileEntryId } },
    type: 'file',
    url: `file:///${filename}`,
  };
}

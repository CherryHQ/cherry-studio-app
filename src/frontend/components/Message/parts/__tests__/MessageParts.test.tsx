import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageStatus } from '@/shared/data/types/message';

import type { MessageListItem } from '../../types';
import { MessageParts } from '../MessageParts';

jest.mock('@cherrystudio/ui/components', () => ({
  ContextMenuExclusion: (props: object) => jest.requireActual('react').createElement('View', props),
}));

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

jest.mock('../GeneratedFileStrip', () => {
  const { createElement } = jest.requireActual('react');

  return {
    GeneratedFileStrip: (props: object) => createElement('GeneratedFileStrip', props),
  };
});

jest.mock('../ProcessGroupPart', () => {
  const { createElement } = jest.requireActual('react');

  return {
    ProcessGroupPart: (props: object) => createElement('ProcessGroupPart', props),
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

    expect(renderer.root.findByType('MessagePartRenderer').props.isStreaming).toBe(isStreaming);
    expect(renderer.root.findByType('MessagePartRenderer').props.resolvedText).toBeUndefined();
  });

  test('collects files into one strip and groups sources once', () => {
    const source = makeSourcePart();
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
    const renderer = render(<MessageParts message={message} />);

    const renderedPart = renderer.root.findByType('MessagePartRenderer');
    expect(renderedPart.props.part).toEqual({ text: 'Hello', type: 'text' });
    expect(renderer.root.findByType('GeneratedFileStrip').props.parts).toEqual([
      expect.objectContaining({ filename: 'report.md' }),
      expect.objectContaining({ filename: 'summary.md' }),
    ]);
    expect(renderer.root.findByType('SourceGroup').props.parts).toEqual(message.data.parts);
  });

  test('renders the generated image once without a duplicate Markdown image placeholder', () => {
    const id = '01a0c213-4cfb-741d-807e-624fedfa1ab8';
    const message: MessageListItem = {
      ...makeMessage('success'),
      data: {
        parts: [
          makeFilePart(id, '三国.png', 'image/png'),
          {
            type: 'text',
            text: `![三国名将阵营图](https://preview.cherry.ai/${id})\n\n这张图将三国名将分组。`,
          },
        ],
      },
    };
    const renderer = render(<MessageParts message={message} />);

    expect(renderer.root.findAllByType('GeneratedFileStrip')).toHaveLength(1);
    expect(renderer.root.findByType('MessagePartRenderer').props.part.text).toBe(
      '这张图将三国名将分组。',
    );
    expect(renderer.root.findAllByType('ProcessGroupPart')).toHaveLength(0);
  });

  test('keeps a direct image result at its generation placeholder ratio', () => {
    const message: MessageListItem = {
      ...makeMessage('success'),
      data: { parts: [makeFilePart('file-1', 'result.png', 'image/png')] },
      imageGeneration: { paramValues: { aspectRatio: '16:9' } },
    };
    const renderer = render(<MessageParts message={message} />);

    expect(renderer.root.findByType('GeneratedFileStrip').props.initialImageAspectRatio).toBe(
      16 / 9,
    );
  });

  test.each([
    ['pending', false],
    ['success', true],
    ['error', true],
    ['paused', true],
  ] as const)('status=%s renders settled message results=%p', (status, shouldRenderResults) => {
    const message: MessageListItem = {
      ...makeMessage(status),
      data: {
        parts: [
          { text: 'Hello', type: 'text' },
          makeSourcePart(),
          makeFilePart('file-1', 'report.md'),
        ],
      },
    };
    const renderer = render(<MessageParts message={message} />);

    expect(renderer.root.findAllByType('SourceGroup')).toHaveLength(shouldRenderResults ? 1 : 0);
    expect(renderer.root.findAllByType('GeneratedFileStrip')).toHaveLength(
      shouldRenderResults ? 1 : 0,
    );
  });

  test('folds intermediate text and later tool calls into the timed process', () => {
    const toolPart = (id: string) =>
      ({
        input: {},
        output: {},
        state: 'output-available' as const,
        toolCallId: `call-${id}`,
        toolName: id,
        type: 'dynamic-tool' as const,
      }) as unknown as NonNullable<MessageListItem['data']['parts']>[number];
    const message: MessageListItem = {
      ...makeMessage('success'),
      data: {
        partKeys: ['key-text', 'key-a', 'key-b'],
        parts: [{ text: 'Hello', type: 'text' }, toolPart('a'), toolPart('b')],
      },
    };
    const renderer = render(<MessageParts message={message} />);

    const process = renderer.root.findByType('ProcessGroupPart');
    expect(process.props.items.map((item: { key: string }) => item.key)).toEqual([
      'key-text',
      'key-a',
      'key-b',
    ]);
    expect(renderer.root.findAllByType('MessagePartRenderer')).toHaveLength(0);
  });

  test('folds reasoning and tools before the answer into one timed process group', () => {
    const reasoningPart = { state: 'done' as const, text: 'Reasoning', type: 'reasoning' as const };
    const toolPart = {
      input: {},
      output: {},
      state: 'output-available' as const,
      toolCallId: 'call-a',
      toolName: 'a',
      type: 'dynamic-tool' as const,
    } as unknown as NonNullable<MessageListItem['data']['parts']>[number];
    const message: MessageListItem = {
      ...makeMessage('success'),
      createdAt: '2026-09-02T00:00:00.000Z',
      data: {
        partKeys: ['reasoning-key', 'tool-key', 'text-key'],
        parts: [reasoningPart, toolPart, { text: 'Answer', type: 'text' }],
      },
      stats: {
        runtimeTiming: { startedAt: 1_000, completedAt: 17_000, spans: [] },
      },
    };

    const renderer = render(<MessageParts message={message} />);
    const process = renderer.root.findByType('ProcessGroupPart');

    expect(process.props.items.map((item: { key: string }) => item.key)).toEqual([
      'reasoning-key',
      'tool-key',
    ]);
    expect(process.props.renderMode).toBe('markdown');
    expect(renderer.root.findAllByType('MessagePartRenderer')).toHaveLength(1);
  });

  test('keeps the process owner mounted from streaming through completion', () => {
    const reasoningPart = {
      state: 'streaming' as const,
      text: 'Reasoning',
      type: 'reasoning' as const,
    };
    const pendingMessage: MessageListItem = {
      ...makeMessage('pending'),
      data: {
        partKeys: ['reasoning-key', 'text-key'],
        parts: [reasoningPart, { state: 'streaming', text: 'Answer', type: 'text' }],
      },
    };
    const renderer = render(<MessageParts message={pendingMessage} />);

    const process = renderer.root.findByType('ProcessGroupPart');
    expect(process.props.items.map(({ key }: { key: string }) => key)).toEqual(['reasoning-key']);
    expect(
      renderer.root.findAllByType('MessagePartRenderer').map((part) => part.props.part.type),
    ).toEqual(['text']);

    act(() => {
      renderer.update(
        <MessageParts
          message={{
            ...pendingMessage,
            data: {
              ...pendingMessage.data,
              parts: [
                { ...reasoningPart, state: 'done' },
                { state: 'done', text: 'Answer', type: 'text' },
              ],
            },
            status: 'success',
          }}
        />,
      );
    });

    expect(renderer.root.findAllByType('ProcessGroupPart')).toHaveLength(1);
    expect(renderer.root.findByType('ProcessGroupPart')).toBe(process);
    expect(renderer.root.findAllByType('MessagePartRenderer')).toHaveLength(1);
  });

  test.each(['pending', 'success'] as const)(
    'shows a generated image before its explanation exactly once while %s',
    (status) => {
      const message: MessageListItem = {
        ...makeMessage(status),
        data: {
          parts: [
            { text: 'Here it is', type: 'text' },
            makeFilePart('file-1', 'chart.png', 'image/png'),
            { text: 'and a revision', type: 'text' },
          ],
        },
      };
      const renderer = render(<MessageParts message={message} />);
      const rendered = renderer.root.findAll(
        (node) =>
          node.type === 'ProcessGroupPart' ||
          node.type === 'MessagePartRenderer' ||
          node.type === 'GeneratedFileStrip',
      );

      expect(rendered.map((node) => node.type)).toEqual([
        'ProcessGroupPart',
        'GeneratedFileStrip',
        'MessagePartRenderer',
      ]);
      expect(renderer.root.findAllByType('GeneratedFileStrip')).toHaveLength(1);
      expect(renderer.root.findByType('GeneratedFileStrip').props.parts).toEqual([
        message.data.parts![1],
      ]);
    },
  );
});

function makeFilePart(fileEntryId: string, filename: string, mediaType = 'text/markdown') {
  return {
    filename,
    mediaType,
    providerMetadata: { cherry: { fileEntryId } },
    type: 'file' as const,
    url: `cherry://file/${fileEntryId}`,
  };
}

function makeSourcePart() {
  return {
    sourceId: 'source-1',
    title: 'Cherry Studio',
    type: 'source-url' as const,
    url: 'https://cherry-ai.com',
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

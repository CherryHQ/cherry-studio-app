import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { MessageListLiveTailProvider } from '../../list/MessageListLiveTailContext';
import { ReasoningPart } from '../ReasoningPart';

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  return {
    MessagePart: {
      Reasoning: function MockReasoning({ children }: { children: ReactNode }) {
        const [isOpen, setIsOpen] = React.useState(false);
        return React.createElement(
          'Reasoning',
          { onPress: () => setIsOpen((open: boolean) => !open) },
          isOpen ? children : null,
        );
      },
    },
  };
});

jest.mock('@/frontend/components/MarkdownText', () => ({
  MarkdownText: (props: object) => jest.requireActual('react').createElement('MarkdownText', props),
}));

type ReasoningMessagePart = Extract<CherryMessagePart, { type: 'reasoning' }>;

const longReasoning =
  '# Reasoning\n\n```ts\n' +
  'const thought = "Keep the complete code block 😀";\n'.repeat(200) +
  '```\n\n$$\\sum_{i=1}^{n} i$$\n\n[Reference](https://example.com)\n';

describe('ReasoningPart', () => {
  let renderer: ReactTestRenderer | undefined;
  const render = (text: string, isStreaming = false, isVisible = true) => {
    const part: ReasoningMessagePart = {
      state: isStreaming ? 'streaming' : 'done',
      text,
      type: 'reasoning',
    };
    const element = (
      <MessageListLiveTailProvider isVisible={isVisible}>
        <ReasoningPart isStreaming={isStreaming} part={part} />
      </MessageListLiveTailProvider>
    );
    act(() => {
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
  };
  const toggle = () => act(() => renderer!.root.findByType('Reasoning' as never).props.onPress());
  const shown = () => renderer!.root.findByType('MarkdownText' as never).props.markdown as string;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('keeps the complete Markdown document as reasoning grows beyond the former page limit', () => {
    render(longReasoning.slice(0, 8000), true);
    toggle();
    const markdown = renderer!.root.findByType('MarkdownText' as never);

    render(longReasoning, true);
    expect(shown()).toBe(longReasoning);
    expect(renderer!.root.findByType('MarkdownText' as never)).toBe(markdown);
    expect(markdown.props.isStreaming).toBe(true);

    render(longReasoning, false);
    expect(shown()).toBe(longReasoning);
    expect(renderer!.root.findByType('MarkdownText' as never)).toBe(markdown);
    expect(markdown.props.isStreaming).toBe(false);
  });

  test('holds long reasoning off screen and catches up without discarding earlier content', () => {
    render(longReasoning, true);
    toggle();
    render(longReasoning + '\nMore thought', true, false);
    expect(shown()).toBe(longReasoning);

    render(longReasoning + '\nMore thought', true, true);
    expect(shown()).toBe(longReasoning + '\nMore thought');

    render(longReasoning + '\nFinal thought', false, false);
    expect(shown()).toBe(longReasoning + '\nFinal thought');
  });

  test('reopens the complete document after reasoning grows while collapsed', () => {
    render(longReasoning, true);
    toggle();
    toggle();
    expect(renderer!.root.findAllByType('MarkdownText' as never)).toHaveLength(0);

    render(longReasoning + '\nConclusion');
    toggle();
    expect(shown()).toBe(longReasoning + '\nConclusion');
  });
});

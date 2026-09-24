import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { ReasoningPart } from '../ReasoningPart';

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  return {
    Button: (props: object) => React.createElement('Button', props),
    MessagePart: {
      Reasoning: (props: object) => React.createElement('Reasoning', props),
    },
  };
});

jest.mock('../PartMarkdown', () => ({
  PartMarkdown: (props: object) => jest.requireActual('react').createElement('PartMarkdown', props),
}));

type ReasoningMessagePart = Extract<CherryMessagePart, { type: 'reasoning' }>;

describe('ReasoningPart', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('keeps short reasoning in Markdown', () => {
    const part: ReasoningMessagePart = { state: 'done', text: 'Short thought', type: 'reasoning' };
    act(() => {
      renderer = create(<ReasoningPart isStreaming={false} part={part} />);
    });
    expect(renderer?.root.findByType('PartMarkdown' as never).props.markdown).toBe('Short thought');
  });

  test('renders every long-reasoning page without sending the full text to Markdown', () => {
    const text = 'A'.repeat(8201) + '😀' + 'B'.repeat(8191);
    const part: ReasoningMessagePart = { state: 'streaming', text, type: 'reasoning' };
    act(() => {
      renderer = create(<ReasoningPart isStreaming part={part} />);
    });

    const visibleText = () =>
      renderer!.root.findAllByType(Text).find((node) => node.props.selectable)?.props
        .children as string;
    const buttons = () => renderer!.root.findAllByType('Button' as never);
    const pages = [visibleText()];
    for (let index = 0; index < 3 && !buttons()[0].props.disabled; index++) {
      act(() => buttons()[0].props.onPress());
      pages.unshift(visibleText());
    }

    expect(pages.join('')).toBe(text);
    expect(pages.every((page) => page.length <= 8192)).toBe(true);
    expect(renderer?.root.findAllByType('PartMarkdown' as never)).toHaveLength(0);

    for (let index = 0; index < 3 && !buttons()[1].props.disabled; index++) {
      act(() => buttons()[1].props.onPress());
    }
    expect(visibleText()).toBe(pages[pages.length - 1]);
  });
});

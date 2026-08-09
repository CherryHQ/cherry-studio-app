import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PartMarkdown } from '../PartMarkdown';

jest.mock('@/frontend/components/markdown', () => {
  const { createElement } = jest.requireActual('react');

  return {
    MarkdownText: (props: object) => createElement('MarkdownText', props),
  };
});

describe('PartMarkdown', () => {
  test.each([true, false])('passes streaming=%p to the shared renderer', (isStreaming) => {
    const renderer = render(<PartMarkdown isStreaming={isStreaming} markdown="Hello" />);

    expect(renderer.root.findByType('MarkdownText').props).toEqual({
      isStreaming,
      markdown: 'Hello',
    });
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

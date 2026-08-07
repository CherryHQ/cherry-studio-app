import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MarkdownText } from '../MarkdownText';

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [0, jest.fn()],
}));

jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: () => [
    'foreground',
    'background',
    'muted-foreground',
    'link',
    'primary',
    'border',
    'secondary',
  ],
}));

jest.mock('react-native-enriched-markdown', () => {
  const { createElement } = jest.requireActual('react');

  return {
    EnrichedMarkdownText: (props: object) => createElement('EnrichedMarkdownText', props),
  };
});

jest.mock('react-native-streamdown', () => {
  const { createElement } = jest.requireActual('react');

  return {
    StreamdownText: (props: object) => createElement('StreamdownText', props),
  };
});

describe('MarkdownText', () => {
  test.each([
    [true, 'StreamdownText', 'EnrichedMarkdownText'],
    [false, 'EnrichedMarkdownText', 'StreamdownText'],
  ] as const)(
    'isStreaming=%p uses %s with shared typography',
    (isStreaming, expected, excluded) => {
      const renderer = render(
        <MarkdownText fontSizeStep={2} isStreaming={isStreaming} markdown="Hello" />,
      );
      const props = renderer.root.findByType(expected).props;

      expect(props).toEqual(
        expect.objectContaining({
          allowTrailingMargin: false,
          flavor: 'github',
          markdown: 'Hello',
          md4cFlags: { latexMath: true, underline: false },
          selectable: true,
        }),
      );
      expect(props.markdownStyle).toEqual(
        expect.objectContaining({
          paragraph: { fontSize: 20, lineHeight: 26 },
          h1: { fontSize: 48, lineHeight: 56 },
          h2: { fontSize: 40, lineHeight: 48 },
          // Code cannot reach the `font-mono` utility through a style object,
          // so the family is named explicitly for both themes.
          code: { fontFamily: 'GeistMono-Regular' },
          codeBlock: { fontFamily: 'GeistMono-Regular', fontSize: 18, lineHeight: 28 },
          table: { fontSize: 18, lineHeight: 28 },
        }),
      );
      expect(renderer.root.findAllByType(excluded)).toHaveLength(0);
    },
  );
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

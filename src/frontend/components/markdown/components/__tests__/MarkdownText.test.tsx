import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MarkdownText } from '../MarkdownText';

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [0, jest.fn()],
}));

// Echo the requested token names back as the colors, so an assertion below
// reads as "this style slot is fed by this token".
jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: (names: readonly string[]) => names,
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

let mockTheme = 'light';

jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: mockTheme }),
}));

describe('MarkdownText', () => {
  beforeEach(() => {
    mockTheme = 'light';
  });

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
          paragraph: { color: 'foreground', fontSize: 20, lineHeight: 26 },
          h1: { color: 'foreground', fontSize: 40, lineHeight: 48 },
          h2: { color: 'foreground', fontSize: 32, lineHeight: 40 },
          // Code cannot reach the `font-mono` utility through a style object,
          // so the family is named explicitly. Colors come from the product
          // domain tokens, not from the renderer's own palette — and they do so
          // in light mode too, which is what the color-scheme branch used to
          // skip.
          code: {
            backgroundColor: 'inline-code',
            borderColor: 'border',
            color: 'inline-code-foreground',
            fontFamily: 'GeistMono-Regular',
          },
          codeBlock: expect.objectContaining({
            backgroundColor: 'code-block',
            borderColor: 'border',
            color: 'foreground',
            fontFamily: 'GeistMono-Regular',
            fontSize: 18,
            lineHeight: 28,
          }),
        }),
      );
      expect(renderer.root.findAllByType(excluded)).toHaveLength(0);
    },
  );

  // Native syntax highlighting draws every token type it was not given a color
  // for in the plain code color, so an absent or half-filled `syntaxColors`
  // silently renders as no highlighting at all.
  test.each(['light', 'dark'] as const)('%s mode highlights code with its own palette', (mode) => {
    mockTheme = mode;
    const renderer = render(<MarkdownText markdown="Hello" />);
    const { syntaxColors } =
      renderer.root.findByType('EnrichedMarkdownText').props.markdownStyle.codeBlock;

    expect(syntaxColors).toEqual(
      expect.objectContaining({
        keyword: mode === 'dark' ? '#C792EA' : '#A626A4',
        // Both upstream themes pick a comment gray against their own editor
        // background that lands near 2:1 on ours, so this one slot is a token.
        comment: 'muted-foreground',
      }),
    );
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

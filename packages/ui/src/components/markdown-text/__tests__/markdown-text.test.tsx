import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MarkdownText } from '../components/markdown-text';

jest.mock('react-native-enriched-markdown', () => {
  const { createElement } = jest.requireActual('react');
  return {
    EnrichedMarkdownText: (props: object) => createElement('EnrichedMarkdownText', props),
  };
});

jest.mock('react-native-streamdown', () => {
  const { createElement } = jest.requireActual('react');
  return { StreamdownText: (props: object) => createElement('StreamdownText', props) };
});

let mockTheme = 'light';

jest.mock('uniwind', () => ({
  useCSSVariable: (names: string[]) =>
    names.map((name) =>
      name === '--font-mono' ? 'GeistMono-Regular' : name.replace('--color-', ''),
    ),
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
      const onLinkPress = jest.fn();
      const renderer = render(
        <MarkdownText
          fontSizeStep={2}
          isStreaming={isStreaming}
          markdown="Hello"
          onLinkPress={onLinkPress}
        />,
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
          paragraph: expect.objectContaining({
            color: 'foreground',
            fontSize: 20,
            lineHeight: 26,
            marginBottom: 12,
            marginTop: 0,
          }),
          h1: expect.objectContaining({ color: 'foreground', fontSize: 40, lineHeight: 48 }),
          h2: expect.objectContaining({ color: 'foreground', fontSize: 32, lineHeight: 40 }),
          code: expect.objectContaining({
            backgroundColor: 'inline-code',
            borderColor: 'border',
            color: 'inline-code-foreground',
            fontFamily: 'GeistMono-Regular',
            fontSize: 18,
          }),
          codeBlock: expect.objectContaining({
            backgroundColor: 'code-block',
            borderColor: 'border',
            color: 'foreground',
            fontFamily: 'GeistMono-Regular',
            fontSize: 18,
            lineHeight: 28,
          }),
          math: expect.objectContaining({
            backgroundColor: 'code-block',
            color: 'foreground',
            fontSize: 20,
            marginBottom: 14,
            marginTop: 4,
            padding: 12,
            textAlign: 'center',
          }),
        }),
      );
      expect(renderer.root.findAllByType(excluded)).toHaveLength(0);

      act(() => props.onLinkPress({ url: 'https://cherry-ai.com' }));
      expect(onLinkPress).toHaveBeenCalledWith('https://cherry-ai.com');
    },
  );

  test.each(['light', 'dark'] as const)('%s mode highlights code with its own palette', (mode) => {
    mockTheme = mode;
    const renderer = render(
      <MarkdownText fontSizeStep={0} markdown="Hello" onLinkPress={jest.fn()} />,
    );
    const { syntaxColors } =
      renderer.root.findByType('EnrichedMarkdownText').props.markdownStyle.codeBlock;

    expect(syntaxColors).toEqual(
      expect.objectContaining({
        comment: 'muted-foreground',
        keyword: mode === 'dark' ? '#C792EA' : '#A626A4',
      }),
    );
  });

  test('keeps the streaming renderer mounted when the part reaches terminal state', () => {
    const onLinkPress = jest.fn();
    const renderer = render(
      <MarkdownText fontSizeStep={0} isStreaming markdown="Partial" onLinkPress={onLinkPress} />,
    );

    act(() => {
      renderer.update(
        <MarkdownText
          fontSizeStep={0}
          isStreaming={false}
          markdown="Complete"
          onLinkPress={onLinkPress}
        />,
      );
    });

    expect(renderer.root.findByType('StreamdownText').props.markdown).toBe('Complete');
    expect(renderer.root.findAllByType('EnrichedMarkdownText')).toHaveLength(0);
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

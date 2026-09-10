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
          md4cFlags: { latexMath: true, superscript: true, underline: false },
          selectable: true,
          streamingAnimation: isStreaming,
        }),
      );
      expect(props.markdownStyle).toEqual(
        expect.objectContaining({
          paragraph: expect.objectContaining({
            color: 'foreground',
            fontSize: 20,
            lineHeight: 28,
            marginBottom: 12,
            marginTop: 0,
          }),
          h1: expect.objectContaining({ color: 'foreground', fontSize: 32, lineHeight: 40 }),
          h2: expect.objectContaining({
            color: 'foreground',
            fontSize: 24,
            lineHeight: 32,
            marginBottom: 8,
            marginTop: 0,
          }),
          list: expect.objectContaining({
            fontSize: 20,
            gapWidth: 10,
            lineHeight: 28,
            marginLeft: 8,
            marginTop: 0,
            markerMinWidth: 30,
          }),
          code: expect.objectContaining({
            backgroundColor: 'inline-code',
            borderColor: 'inline-code',
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
            backgroundColor: 'transparent',
            color: 'foreground',
            fontSize: 20,
            marginBottom: 12,
            marginTop: 0,
            padding: 12,
            textAlign: 'center',
          }),
          superscript: { baselineOffsetScale: 0.3, fontScale: 0.75 },
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

  test.each([
    ['with the last text update', 'Partial', 'Complete'],
    [
      'without another text update',
      '| Item |\n| --- |\n| Final row',
      '| Item |\n| --- |\n| Final row',
    ],
  ])('settles the native tail %s without remounting the renderer', (_label, partial, complete) => {
    const onLinkPress = jest.fn();
    const renderer = render(
      <MarkdownText fontSizeStep={0} isStreaming markdown={partial} onLinkPress={onLinkPress} />,
    );
    const block = renderer.root.findByType('StreamdownText');
    expect(block.props.streamingAnimation).toBe(true);

    act(() => {
      renderer.update(
        <MarkdownText
          fontSizeStep={0}
          isStreaming={false}
          markdown={complete}
          onLinkPress={onLinkPress}
        />,
      );
    });

    expect(renderer.root.findByType('StreamdownText')).toBe(block);
    expect(block.props.markdown).toBe(complete);
    expect(block.props.streamingAnimation).toBe(false);
    expect(renderer.root.findAllByType('EnrichedMarkdownText')).toHaveLength(0);

    act(() => renderer.unmount());
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

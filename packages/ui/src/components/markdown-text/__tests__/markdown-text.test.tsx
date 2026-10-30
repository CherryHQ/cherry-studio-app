import { createElement, type ReactElement } from 'react';
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
            externalControls: false,
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

  test('renders citation links in a low-emphasis neutral, apart from other links', () => {
    const renderer = render(
      <MarkdownText
        citationLinkPrefix="cite:"
        fontSizeStep={0}
        markdown="Claim [1](cite:https%3A%2F%2Fexample.com)"
        onLinkPress={jest.fn()}
      />,
    );
    const { link, linkVariants } =
      renderer.root.findByType('EnrichedMarkdownText').props.markdownStyle;

    expect(link).toEqual({ color: 'link', underline: false });
    expect(linkVariants).toEqual({ '^cite:': { color: 'foreground-tertiary' } });
  });

  test.each([
    [true, 'StreamdownText'],
    [false, 'EnrichedMarkdownText'],
  ] as const)('normalizes TeX formulas for isStreaming=%p', (isStreaming, component) => {
    const renderer = render(
      <MarkdownText
        fontSizeStep={0}
        isStreaming={isStreaming}
        markdown={'Inline \\(x\\).\n\n\\[\nE\n= 1\n\\]'}
        onLinkPress={jest.fn()}
      />,
    );

    expect(renderer.root.findByType(component).props.markdown).toBe('Inline $x$.\n\n$$ E = 1 $$');
    act(() => renderer.unmount());
  });

  test.each([
    ['with the last text update', 'Partial', 'Complete'],
    ['with an incomplete formula', String.raw`Partial \[E =`, String.raw`Partial \[E =`],
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

  test('keeps Mermaid fences as code blocks without a diagram presenter', () => {
    const markdown = 'Intro\n\n```mermaid\nflowchart LR\nA --> B\n```\n';
    const renderer = render(
      <MarkdownText fontSizeStep={0} markdown={markdown} onLinkPress={jest.fn()} />,
    );

    expect(renderer.root.findByType('EnrichedMarkdownText').props.markdown).toBe(markdown);
    act(() => renderer.unmount());
  });

  test('presents a completed streamed fence without remounting the text before it', () => {
    const renderMermaid = jest.fn(({ source }: { source: string }) => (
      <MermaidDiagram source={source} />
    ));
    const intro = 'Intro\n\n';
    const fence = '```mermaid\nflowchart LR\nA --> B\n```';
    const renderer = render(
      <MarkdownText
        fontSizeStep={0}
        isStreaming
        markdown={`${intro}${fence}`}
        onLinkPress={jest.fn()}
        renderMermaid={renderMermaid}
      />,
    );
    const [streamed] = renderer.root.findAllByType('StreamdownText');
    expect(renderMermaid).not.toHaveBeenCalled();

    act(() => {
      renderer.update(
        <MarkdownText
          fontSizeStep={0}
          isStreaming
          markdown={`${intro}${fence}\nAfter`}
          onLinkPress={jest.fn()}
          renderMermaid={renderMermaid}
        />,
      );
    });

    const texts = renderer.root.findAllByType('StreamdownText');
    expect(texts[0]).toBe(streamed);
    expect(texts.map((text) => [text.props.markdown, text.props.streamingAnimation])).toEqual([
      [intro, false],
      ['After', true],
    ]);
    expect(renderer.root.findByType('MermaidDiagram').props.source).toBe('flowchart LR\nA --> B\n');
    act(() => renderer.unmount());
  });
});

function MermaidDiagram(props: { source: string }) {
  return createElement('MermaidDiagram', props);
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

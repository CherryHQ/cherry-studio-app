import type { CherryMessagePart, MessageStatus } from '@cherrystudio/universal/data/types/message';

import type { MessagePresentationItem } from '@/frontend/components/messagePresentation';

import { projectAssistantMessageReadAloud } from '../projectAssistantMessageReadAloud';

describe('projectAssistantMessageReadAloud', () => {
  test.each<MessageStatus>(['pending', 'paused', 'error'])(
    'rejects an assistant message with %s status',
    (status) => {
      expect(
        projectAssistantMessageReadAloud(createMessage([textPart('Answer')], { status })),
      ).toBe(null);
    },
  );

  test('rejects a successful user message', () => {
    expect(
      projectAssistantMessageReadAloud(createMessage([textPart('Question')], { role: 'user' })),
    ).toBe(null);
  });

  test('uses only the last non-empty translation and returns its target language', () => {
    const message = createMessage([
      textPart('Original answer'),
      translationPart('Première traduction', 'fr'),
      translationPart('   ', 'de'),
      translationPart('## Final **translation**', 'en-US'),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      language: 'en-US',
      text: 'Final translation',
    });
  });

  test('falls back to original text when every translation is whitespace', () => {
    const message = createMessage([
      textPart('Original `answer`'),
      translationPart('  ', 'fr'),
      translationPart('\n\t', 'de'),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({ text: 'Original answer' });
  });

  test('does not fall back to original text when the selected translation cleans to empty', () => {
    const message = createMessage([
      textPart('Original answer'),
      translationPart('```ts\nconst hidden = true;\n```', 'en'),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toBe(null);
  });

  test('projects only original text parts', () => {
    const message = createMessage([
      textPart('First paragraph'),
      { state: 'done', text: 'Private reasoning', type: 'reasoning' },
      {
        data: { content: 'const hidden = true', language: 'ts' },
        type: 'data-code',
      },
      {
        data: { compactedContent: 'source', content: 'Hidden compact summary' },
        type: 'data-compact',
      },
      { data: { message: 'Hidden error' }, type: 'data-error' },
      { data: { filePath: '/hidden.mp4' }, type: 'data-video' },
      {
        filename: 'hidden.png',
        mediaType: 'image/png',
        type: 'file',
        url: 'file:///hidden.png',
      },
      {
        input: {},
        output: 'Hidden tool output',
        state: 'output-available',
        toolCallId: 'tool-1',
        type: 'tool-example',
      } as unknown as CherryMessagePart,
      textPart('Second paragraph'),
      translationPart('   ', 'en'),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'First paragraph\n\nSecond paragraph',
    });
  });

  test('removes fenced code blocks and keeps inline-code text', () => {
    const message = createMessage([
      textPart('Before `inline value`.\n\n```ts\nconst hidden = true;\n```\n\nAfter.'),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'Before inline value.\n\nAfter.',
    });
  });

  test('removes an unterminated fenced code block through the end of the text', () => {
    const message = createMessage([
      textPart('Spoken intro.\n\n~~~python\nprint("never spoken")\nstill code'),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({ text: 'Spoken intro.' });
  });

  test('keeps link labels while removing images, citations, and bare URLs', () => {
    const message = createMessage([
      textPart(
        'Read [the guide](https://example.com/guide) [cite:doc-1] [2] 【3†source】 ' +
          '![architecture](https://example.com/image.png), then visit https://example.com/path?q=1.',
      ),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'Read the guide, then visit.',
    });
  });

  test('removes numeric citation links while preserving ordinary link labels', () => {
    const message = createMessage([
      textPart(
        'Read [the guide](https://example.com/guide) [2](https://example.com/source), then continue.',
      ),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'Read the guide, then continue.',
    });
  });

  test('removes block markers and emphasis while preserving line and paragraph order', () => {
    const message = createMessage([
      textPart(
        '# Heading\n\n- First **bold** item\n1. Second *italic* item\n> Quoted __text__ with ~~detail~~',
      ),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'Heading\n\nFirst bold item\nSecond italic item\nQuoted text with detail',
    });
  });

  test.each(['snake_case', '2 * 3', '2*3*4', '2*3 + 4*5'])(
    'preserves delimiter-like literal text %p',
    (markdown) => {
      expect(projectAssistantMessageReadAloud(createMessage([textPart(markdown)]))).toEqual({
        text: markdown,
      });
    },
  );

  test('preserves multiplication operators projected from simple inline math', () => {
    expect(projectAssistantMessageReadAloud(createMessage([textPart('$2*3*4$')]))).toEqual({
      text: '2*3*4',
    });
  });

  test.each([
    ['Keep \\*literal\\*.', 'Keep *literal*.'],
    ['Keep \\_literal\\_.', 'Keep _literal_.'],
    ['\\* literal at the start of a line', '* literal at the start of a line'],
  ])('preserves escaped emphasis delimiters in %p', (markdown, expectedText) => {
    expect(projectAssistantMessageReadAloud(createMessage([textPart(markdown)]))).toEqual({
      text: expectedText,
    });
  });

  test('pairs emphasis after an even number of backslashes', () => {
    const message = createMessage([textPart('\\\\*foo*')]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({ text: '\\foo' });
  });

  test.each(['Keep *unclosed.', 'Keep _unclosed.', 'Keep **unclosed.'])(
    'preserves an unclosed emphasis delimiter in %p',
    (markdown) => {
      expect(projectAssistantMessageReadAloud(createMessage([textPart(markdown)]))).toEqual({
        text: markdown,
      });
    },
  );

  test('does not pair emphasis delimiters across a blank line', () => {
    const markdown = 'First *unclosed.\n\nSecond close*';

    expect(projectAssistantMessageReadAloud(createMessage([textPart(markdown)]))).toEqual({
      text: markdown,
    });
  });

  test('does not pair emphasis delimiters across adjacent block lines', () => {
    const message = createMessage([textPart('# First *unclosed\n- Second close*')]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'First *unclosed\nSecond close*',
    });
  });

  test('preserves a large sequence of unmatched emphasis delimiters', () => {
    const markdown = Array.from({ length: 4096 }, () => 'term*').join(' ');

    expect(projectAssistantMessageReadAloud(createMessage([textPart(markdown)]))).toEqual({
      text: markdown,
    });
  });

  test('projects nested emphasis markers without dropping their content', () => {
    const message = createMessage([textPart('Read **outer _inner_ text** and ***bold italic***.')]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'Read outer inner text and bold italic.',
    });
  });

  test('keeps simple inline math and removes block or complex LaTeX math', () => {
    const message = createMessage([
      textPart(
        'Physics: $E=mc²$ and $x+y$. Arithmetic: \\(1+1=2\\).\n\n' +
          '$$\\int_0^1 x dx$$\n\n' +
          'Skip $\\frac{1}{2}$ and \\(\\sqrt{x}\\), then finish.',
      ),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'Physics: E=mc² and x+y. Arithmetic: 1+1=2.\n\nSkip and, then finish.',
    });
  });

  test('rejects content made only of fenced code', () => {
    expect(
      projectAssistantMessageReadAloud(
        createMessage([textPart('```js\nconsole.log("hidden")\n```')]),
      ),
    ).toBe(null);
  });

  test('rejects content made only of complex math', () => {
    const message = createMessage([
      textPart('$$\n\\begin{matrix}1 & 2 \\\\ 3 & 4\\end{matrix}\n$$\n\n$\\sum_{i=1}^n i$'),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toBe(null);
  });

  test('rejects emoji-only text but preserves emoji mixed with natural text', () => {
    expect(projectAssistantMessageReadAloud(createMessage([textPart('🎉 🚀')]))).toBe(null);
    expect(projectAssistantMessageReadAloud(createMessage([textPart('Great work 🎉')]))).toEqual({
      text: 'Great work 🎉',
    });
  });

  test('rejects a bare URL-only sentence after preserving its punctuation', () => {
    expect(
      projectAssistantMessageReadAloud(createMessage([textPart('https://example.com/path?q=1.')])),
    ).toBe(null);
  });

  test('reads Markdown tables as rows and cells without table syntax', () => {
    const message = createMessage([
      textPart('| Name | Value |\n| :--- | ---: |\n| Alpha | 1 |\n| Beta | 2 |\n\nClosing note.'),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'Name, Value. Alpha, 1. Beta, 2.\n\nClosing note.',
    });
  });

  test('rejects empty or filtered-only original content', () => {
    const message = createMessage([
      textPart('  '),
      { state: 'done', text: 'Reasoning only', type: 'reasoning' },
      {
        data: { content: 'hidden', language: 'txt' },
        type: 'data-code',
      },
    ]);

    expect(projectAssistantMessageReadAloud(message)).toBe(null);
  });
});

function createMessage(
  parts: CherryMessagePart[],
  overrides: Partial<Pick<MessagePresentationItem, 'role' | 'status'>> = {},
): MessagePresentationItem {
  return {
    data: { parts },
    id: '00000000-0000-7000-8000-000000000010',
    role: 'assistant',
    status: 'success',
    ...overrides,
  };
}

function textPart(text: string): CherryMessagePart {
  return { text, type: 'text' };
}

function translationPart(
  content: string,
  targetLanguage: string,
): Extract<CherryMessagePart, { type: 'data-translation' }> {
  return {
    data: { content, targetLanguage },
    type: 'data-translation',
  };
}

import type { MessageListItem } from '@/frontend/components/messages';
import type { CherryMessagePart, MessageStatus } from '@/shared/data/types/message';

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

  test('omits a single language for mixed original and block-translated text', () => {
    const message = createMessage([
      textPart('Keep the first block.'),
      textPart('Replace the second block.'),
      translationPart('Deuxième bloc traduit.', 'fr', 'second-block'),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      language: null,
      text: 'Keep the first block.\n\nDeuxième bloc traduit.',
    });
  });

  test('keeps the language when every projected block uses the same translation language', () => {
    const message = createMessage([
      textPart('Replace the first block.'),
      translationPart('Premier bloc traduit.', 'fr', 'first-block'),
      textPart('Replace the second block.'),
      translationPart('Deuxième bloc traduit.', 'fr', 'second-block'),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      language: 'fr',
      text: 'Premier bloc traduit.\n\nDeuxième bloc traduit.',
    });
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

  test('preserves Markdown delimiter characters inside inline code spans', () => {
    const message = createMessage([
      textPart(
        'Call `train_test_split`, `__init__`, and `a*b*c`; use `C:\\Users\\_temp` and keep `**inside**`.',
      ),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'Call train_test_split, __init__, and a*b*c; use C:\\Users\\_temp and keep **inside**.',
    });
  });

  test('closes an inline code span only with an equal-length backtick run', () => {
    const message = createMessage([textPart('Keep ``alpha ` beta`` after.')]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'Keep alpha ` beta after.',
    });
  });

  test('protects an equal-run code span across a soft line break', () => {
    const message = createMessage([textPart('Keep `alpha\n__init__` after.')]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'Keep alpha __init__ after.',
    });
  });

  test('preserves link and math syntax inside inline code spans', () => {
    const markdown = 'Keep `[label](target)` and `$value$` unchanged.';

    expect(projectAssistantMessageReadAloud(createMessage([textPart(markdown)]))).toEqual({
      text: 'Keep [label](target) and $value$ unchanged.',
    });
  });

  test('preserves private-use marker characters inside and outside inline code', () => {
    const markdown = '\uE000 Keep `\uE000__init__` unchanged.';

    expect(projectAssistantMessageReadAloud(createMessage([textPart(markdown)]))).toEqual({
      text: '\uE000 Keep \uE000__init__ unchanged.',
    });
  });

  test('removes fenced and indented code nested in list and quote containers', () => {
    const message = createMessage([
      textPart(
        'Steps:\n\n' +
          '1. Install it:\n\n' +
          '    ```bash\n' +
          '    export API_KEY=sk-secret\n' +
          '    ```\n\n' +
          '2. Done.\n\n' +
          '> Example:\n' +
          '> ```js\n' +
          '> console.log("hidden")\n' +
          '> ```\n\n' +
          'Also hidden:\n\n' +
          '    const apiKey = "sk-secret";\n\n' +
          'Finish.',
      ),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'Steps:\n\nInstall it:\n\nDone.\n\nExample:\n\nAlso hidden:\n\nFinish.',
    });
  });

  test('keeps a list continuation indented within the item content', () => {
    const message = createMessage([textPart('1. First line\n    continued explanation')]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'First line\ncontinued explanation',
    });
  });

  test('removes indented code four spaces beyond the list content indent', () => {
    const message = createMessage([
      textPart('1. Example:\n\n       const hidden = true;\n\n   Continued explanation.'),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({
      text: 'Example:\n\nContinued explanation.',
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
      text: 'Read the guide [2], then visit.',
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

  test.each(['Set values[2] to 5.', 'Keep plain [2] text.'])(
    'preserves ambiguous numeric brackets in %p',
    (markdown) => {
      expect(projectAssistantMessageReadAloud(createMessage([textPart(markdown)]))).toEqual({
        text: markdown,
      });
    },
  );

  test.each([
    ['[Wikipedia](https://en.wikipedia.org/wiki/Foo_(bar))', 'Before Wikipedia after.'],
    ['![diagram](https://example.com/Foo_(bar))', 'Before after.'],
    ['[2](https://example.com/Foo_(bar))', 'Before after.'],
  ])('projects a balanced-parenthesis destination in %s', (inlineMarkdown, expectedText) => {
    const message = createMessage([textPart(`Before ${inlineMarkdown} after.`)]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({ text: expectedText });
  });

  test('keeps inline code adjacent to a linked URL label', () => {
    const message = createMessage([
      textPart('Use [https://example.com](https://example.com)`code` after.'),
    ]);

    expect(projectAssistantMessageReadAloud(message)).toEqual({ text: 'Use code after.' });
  });

  test.each([
    ['![image](', true],
    ['[2](', true],
    ['[label](', true],
  ])(
    'projects malformed %s destinations without exponential backtracking',
    (prefix, hasSpeakableText) => {
      const markdown = prefix + '\\'.repeat(40);
      const startedAt = Date.now();

      expect(projectAssistantMessageReadAloud(createMessage([textPart(markdown)]))).toEqual(
        hasSpeakableText ? { text: markdown } : null,
      );
      expect(Date.now() - startedAt).toBeLessThan(100);
    },
  );

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

  test.each([
    'It costs $50 for the C:\\path option and $70 in total.',
    'Budget is $5 and the premium tier is $10 per month.',
    'Set $HOME first, then $PATH is used.',
  ])('preserves currency and environment variables in %p', (markdown) => {
    expect(projectAssistantMessageReadAloud(createMessage([textPart(markdown)]))).toEqual({
      text: markdown,
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
  overrides: Partial<Pick<MessageListItem, 'role' | 'status'>> = {},
): MessageListItem {
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
  sourceBlockId?: string,
): Extract<CherryMessagePart, { type: 'data-translation' }> {
  return {
    data: { content, sourceBlockId, targetLanguage },
    type: 'data-translation',
  };
}

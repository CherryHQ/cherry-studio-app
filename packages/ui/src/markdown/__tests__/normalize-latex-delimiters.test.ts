import { normalizeLatexDelimiters } from '../normalize-latex-delimiters';

describe('normalizeLatexDelimiters', () => {
  test('adapts inline and display formulas while preserving TeX commands', () => {
    expect(
      normalizeLatexDelimiters(String.raw`If \(E \leq V_{\min}\), then

\[\frac{d\varphi}{dx}=0\]

Therefore \(\varphi(x)=C\).`),
    ).toBe(String.raw`If $E \leq V_{\min}$, then

$$\frac{d\varphi}{dx}=0$$

Therefore $\varphi(x)=C$.`);
  });

  test('keeps multiline equations out of Markdown heading and quote parsing', () => {
    const markdown = String.raw`\[
E
=
\frac{\hbar^2}{2m}\int_{-\infty}^{+\infty}|\varphi'|^2 dx
> V_{\min}.
\]`;

    expect(normalizeLatexDelimiters(markdown)).toBe(
      String.raw`$$ E = \frac{\hbar^2}{2m}\int_{-\infty}^{+\infty}|\varphi'|^2 dx > V_{\min}. $$`,
    );
  });

  test('preserves explicit TeX row breaks and escaped closing brackets', () => {
    expect(
      normalizeLatexDelimiters(String.raw`\[\begin{aligned}x &= 1 \\[2pt]
y &= 2\end{aligned}\]`),
    ).toBe(String.raw`$$\begin{aligned}x &= 1 \\[2pt] y &= 2\end{aligned}$$`);
    expect(normalizeLatexDelimiters(String.raw`\(x \\) + y\)`)).toBe(String.raw`$x \\) + y$`);
  });

  test('drops TeX line comments before joining formula lines', () => {
    expect(normalizeLatexDelimiters('\\[\na + b % sum\n= c \\\\ % row\n\\text{50\\%}\n\\]')).toBe(
      '$$ a + b  = c \\\\  \\text{50\\%} $$',
    );
  });

  test.each([
    '```tex\n\\[x\\]\n```',
    '~~~tex\n\\(x\\)\n~~~',
    '````md\n```tex\n\\[x\\]\n```\n````',
    '> ```tex\n> \\[x\\]\n> ```',
    '- ```tex\n  \\[x\\]\n  ```',
    '`\\(x\\)`',
    '``a ` \\[x\\]``',
    '`code\n\\(x\\)\ncode`',
    '```tex\n\\[x\\]',
    '~~~tex\n\\[x\\]\n```',
  ])('preserves code: %s', (code) => {
    expect(normalizeLatexDelimiters(code)).toBe(code);
  });

  test('resumes after code spans and fences, including CRLF line endings', () => {
    const markdown = '`\\(code\\)` \\(x\\)\r\n~~~tex\r\n\\[code\\]\r\n~~~\r\n\\[y^2\\]';
    expect(normalizeLatexDelimiters(markdown)).toBe(
      '`\\(code\\)` $x$\r\n~~~tex\r\n\\[code\\]\r\n~~~\r\n$$y^2$$',
    );
  });

  test('treats a backtick without an equal-length closer as literal text', () => {
    expect(normalizeLatexDelimiters('Press ` to open. Then \\(x\\) here.')).toBe(
      'Press ` to open. Then $x$ here.',
    );
    expect(normalizeLatexDelimiters('Use `` then \\(x\\) and `code`')).toBe(
      'Use `` then $x$ and `code`',
    );
    expect(normalizeLatexDelimiters('a ` b\n\n\\(x\\) `c`')).toBe('a ` b\n\n$x$ `c`');
  });

  test('converts formulas indented under list items and paragraph continuations', () => {
    expect(normalizeLatexDelimiters('1. First\n    \\(x\\)')).toBe('1. First\n    $x$');
    expect(normalizeLatexDelimiters('- Step:\n\n    \\[E = mc^2\\]')).toBe(
      '- Step:\n\n    $$E = mc^2$$',
    );
  });

  test('keeps escaped citation brackets as text', () => {
    const markdown = String.raw`See \[1\], \[2-3\] and \[TODO\]; then \[x^2\] and \[\alpha\].`;
    expect(normalizeLatexDelimiters(markdown)).toBe(
      String.raw`See \[1\], \[2-3\] and \[TODO\]; then $$x^2$$ and $$\alpha$$.`,
    );
  });

  test('never lets an inline formula cross a blank line', () => {
    const markdown = 'Use \\( to start.\n\nSome paragraph.\n\n# Heading\n\nAnd \\) to end.';
    expect(normalizeLatexDelimiters(markdown)).toBe(markdown);
    expect(normalizeLatexDelimiters('Text \\[\nE\n\n= 1\n\\]')).toBe('Text \\[\nE\n\n= 1\n\\]');
    expect(normalizeLatexDelimiters('Stray \\( here.\n\n\\(x\\)')).toBe('Stray \\( here.\n\n$x$');
  });

  test('lets a display block that owns its opening line span blank lines', () => {
    expect(normalizeLatexDelimiters('Before.\n\n\\[\nh_i\n=\n\n\\frac{a}{c}\n\\]\n\nAfter.')).toBe(
      'Before.\n\n$$ h_i =  \\frac{a}{c} $$\n\nAfter.',
    );
    expect(normalizeLatexDelimiters('  \\[  \nx = 1 \\]  \nAfter.')).toBe(
      '  $$ x = 1 $$  \nAfter.',
    );
    // A closer that does not end its line falls back to inline handling.
    expect(normalizeLatexDelimiters('\\[\nx = 1\n\n\\] tail')).toBe('\\[\nx = 1\n\n\\] tail');
    expect(normalizeLatexDelimiters('\\[\nx = 1 \\] tail')).toBe('$$ x = 1 $$ tail');
  });

  test('strips quote markers from multiline formulas inside block quotes', () => {
    expect(normalizeLatexDelimiters('> \\[\n> a\n>\n> b^2\n> \\]')).toBe('> $$ a  b^2 $$');
    expect(normalizeLatexDelimiters('> Inline \\(x\n> + y\\).')).toBe('> Inline $x + y$.');
  });

  test('balances nested delimiters and drops the inner pair', () => {
    expect(normalizeLatexDelimiters(String.raw`\(a + \(b + c\)\)`)).toBe('$a + b + c$');
    expect(normalizeLatexDelimiters(String.raw`\[outer \[inner\] x^2\]`)).toBe(
      '$$outer inner x^2$$',
    );
    // An unbalanced outer opener stays literal; the inner pair still renders.
    expect(normalizeLatexDelimiters(String.raw`\(a + \(b\) more`)).toBe(String.raw`\(a + $b$ more`);
  });

  test.each([
    'Plain text, [a link](https://example.com), and (parentheses).',
    String.raw`Escaped \\(x\\) and \\[y\\].`,
    String.raw`Incomplete \(x`,
    String.raw`Mismatched \[x\)`,
  ])('leaves existing syntax and incomplete final messages unchanged: %s', (markdown) => {
    expect(normalizeLatexDelimiters(markdown)).toBe(markdown);
  });

  test('leaves currency and existing dollar math alone', () => {
    expect(normalizeLatexDelimiters(String.raw`Price $5; \(x\).`)).toBe('Price $5; $x$.');
    expect(normalizeLatexDelimiters(String.raw`Costs $5 and \(x\) or $7 done`)).toBe(
      'Costs $5 and $x$ or $7 done',
    );
    expect(normalizeLatexDelimiters(String.raw`$\frac{a}{b}$ and $$\sum_i x_i$$`)).toBe(
      String.raw`$\frac{a}{b}$ and $$\sum_i x_i$$`,
    );
  });

  test('normalizes an opening delimiter after an escaped backslash', () => {
    expect(normalizeLatexDelimiters(String.raw`\\\(x\)`)).toBe(String.raw`\\$x$`);
  });

  const expectAppendOnly = (markdown: string): string => {
    let previous = '';
    for (let end = 0; end <= markdown.length; end += 1) {
      const current = normalizeLatexDelimiters(markdown.slice(0, end), true);
      expect(current.startsWith(previous)).toBe(true);
      previous = current;
    }
    expect(normalizeLatexDelimiters(markdown, false).startsWith(previous)).toBe(true);
    return previous;
  };

  test('holds unfinished streaming formulas without rewriting previously emitted text', () => {
    expect(
      expectAppendOnly(String.raw`First \(x^2\), then
\[
E
= 1
\]
Done.`),
    ).toBe('First $x^2$, then\n$$ E = 1 $$\nDone.');
  });

  test.each([
    ['currency around formulas', String.raw`Costs $5 and \(x\) or $7 done`],
    ['a code span that closes later', 'Use `\\(x\\)` and \\(y\\) here'],
    ['a backtick that never closes', 'Press ` then \\(x\\) here.\n\nNext \\(y\\).'],
    ['a citation bracket', String.raw`See \[1\] and \[x^2\] after.`],
    ['an opener released by a blank line', 'Use \\[ here. More text.\n\nThen \\(z\\).'],
    [
      'a display block across a blank line',
      'Before.\n\n\\[\nh_i\n=\n\n\\frac{a}{c}\n\\]\n\nAfter.',
    ],
    ['nested delimiters', String.raw`Sum \(a + \(b + c\)\) done.`],
  ])('streams append-only with %s', (_name, markdown) => {
    expectAppendOnly(markdown);
  });

  test('releases a withheld tail when its paragraph ends or streaming stops', () => {
    expect(normalizeLatexDelimiters('Use \\[ here. More text', true)).toBe('Use ');
    expect(normalizeLatexDelimiters('Before.\n\\[\nx = 1\n\nStill open', true)).toBe('Before.\n');
    expect(normalizeLatexDelimiters('Before.\n\\[\nx = 1\n\nStill open', false)).toBe(
      'Before.\n\\[\nx = 1\n\nStill open',
    );
    expect(normalizeLatexDelimiters('Use \\[ here. More text\n\nNext', true)).toBe(
      'Use \\[ here. More text\n\nNext',
    );
    expect(normalizeLatexDelimiters('Use `\\(x\\) more', true)).toBe('Use `');
    expect(normalizeLatexDelimiters('Use `\\(x\\) more', false)).toBe('Use `$x$ more');

    const markdown = String.raw`Done \(x\). Pending \[E =`;
    expect(normalizeLatexDelimiters(markdown, true)).toBe('Done $x$. Pending ');
    expect(normalizeLatexDelimiters(markdown, false)).toBe(String.raw`Done $x$. Pending \[E =`);
    expect(normalizeLatexDelimiters('Trailing \\', true)).toBe('Trailing ');
    expect(normalizeLatexDelimiters('Trailing \\', false)).toBe('Trailing \\');
  });
});

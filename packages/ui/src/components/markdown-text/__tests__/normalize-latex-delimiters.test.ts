import { normalizeLatexDelimiters } from '../utils/normalize-latex-delimiters';

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
      String.raw`$$ E = \frac{\hbar^2}{2m}\int_{-\infty}^{+\infty}|\varphi'|^2 dx  > V_{\min}. $$`,
    );
  });

  test('preserves explicit TeX row breaks and escaped closing brackets', () => {
    expect(
      normalizeLatexDelimiters(String.raw`\[\begin{aligned}x &= 1 \\[2pt]
y &= 2\end{aligned}\]`),
    ).toBe(String.raw`$$\begin{aligned}x &= 1 \\[2pt] y &= 2\end{aligned}$$`);
    expect(normalizeLatexDelimiters(String.raw`\(x \\) + y\)`)).toBe(String.raw`$x \\) + y$`);
  });

  test.each([
    '```tex\n\\[x\\]\n```',
    '~~~tex\n\\(x\\)\n~~~',
    '````md\n```tex\n\\[x\\]\n```\n````',
    '> ```tex\n> \\[x\\]\n> ```',
    '- ```tex\n  \\[x\\]\n  ```',
    '    \\[x\\]',
    '\t\\(x\\)',
    '`\\(x\\)`',
    '``a ` \\[x\\]``',
    '`code\n\\(x\\)\ncode`',
    '```tex\n\\[x\\]',
    '~~~tex\n\\[x\\]\n```',
    '`unfinished \\(x\\)',
  ])('preserves code: %s', (code) => {
    expect(normalizeLatexDelimiters(code)).toBe(code);
  });

  test('resumes after code spans and fences, including CRLF line endings', () => {
    const markdown = '`\\(code\\)` \\(x\\)\r\n~~~tex\r\n\\[code\\]\r\n~~~\r\n\\[y\\]';
    expect(normalizeLatexDelimiters(markdown)).toBe(
      '`\\(code\\)` $x$\r\n~~~tex\r\n\\[code\\]\r\n~~~\r\n$$y$$',
    );
    expect(normalizeLatexDelimiters('    ```\n    \\[code\\]\n\n\\(x\\)')).toBe(
      '    ```\n    \\[code\\]\n\n$x$',
    );
  });

  test.each([
    'Plain text, [a link](https://example.com), and (parentheses).',
    String.raw`Escaped \\(x\\) and \\[y\\].`,
    String.raw`$\text{\(literal\)}$ and $$\text{\[literal\]}$$`,
    String.raw`Incomplete \(x`,
    String.raw`Mismatched \[x\)`,
  ])('leaves existing syntax and incomplete final messages unchanged: %s', (markdown) => {
    expect(normalizeLatexDelimiters(markdown)).toBe(markdown);
  });

  test('does not let a currency symbol consume later formulas', () => {
    expect(normalizeLatexDelimiters(String.raw`Price $5; \(x\).`)).toBe('Price $5; $x$.');
  });

  test('normalizes an opening delimiter after an escaped backslash', () => {
    expect(normalizeLatexDelimiters(String.raw`\\\(x\)`)).toBe(String.raw`\\$x$`);
  });

  test('holds unfinished streaming formulas without rewriting previously emitted text', () => {
    const markdown = String.raw`First \(x^2\), then
\[
E
= 1
\]
Done.`;
    let previous = '';
    for (let end = 0; end <= markdown.length; end += 1) {
      const current = normalizeLatexDelimiters(markdown.slice(0, end), true);
      expect(current.startsWith(previous)).toBe(true);
      previous = current;
    }
    expect(previous).toBe('First $x^2$, then\n$$ E = 1 $$\nDone.');
  });

  test('releases an incomplete formula when streaming stops', () => {
    const markdown = String.raw`Done \(x\). Pending \[E =`;
    expect(normalizeLatexDelimiters(markdown, true)).toBe('Done $x$. Pending ');
    expect(normalizeLatexDelimiters(markdown, false)).toBe(String.raw`Done $x$. Pending \[E =`);
    expect(normalizeLatexDelimiters('Trailing \\', true)).toBe('Trailing ');
    expect(normalizeLatexDelimiters('Trailing \\', false)).toBe('Trailing \\');
  });
});

import { replaceInlineTextRanges } from '../replaceInlineTextRanges';
import { speakableText } from '../speechText';

test('reads Markdown prose, including table cells, but skips non-prose blocks and image destinations', () => {
  const markdown = [
    '## 结论',
    '',
    '先看 **重点**：[文档](https://example.com/doc) 与 `npm test`。',
    '',
    '```bash',
    'rm -rf build',
    '```',
    '',
    '    indented code',
    '',
    '![diagram](https://example.com/d.png)',
    '',
    '---',
    '',
    '> Quoted **prose**.',
    '',
    '| 名称 | 值 |',
    '| --- | --- |',
    '| a | 1 |',
    '',
    '- one',
    '- two',
  ].join('\n');
  expect(speakableText(markdown)).toBe(
    ['结论', '先看 重点：文档 与 npm test。', 'Quoted prose.', '名称 值', 'a 1', 'one', 'two'].join(
      '\n',
    ),
  );
});

test('omits HTTP(S) addresses while preserving explicit labels, inline code, domains and versions', () => {
  const markdown = [
    'Read <HTTPS://example.com/a> next. Visit http://example.com/path, please.',
    '版本 v1.2.3，域名 example.com，网址 https://example.com/a后继续。',
    '[https://label.example](https://destination.example) and `https://code.example`.',
  ].join('\n\n');
  expect(speakableText(markdown)).toBe(
    [
      'Read next. Visit, please.',
      '版本 v1.2.3，域名 example.com，网址 后继续。',
      'https://label.example and https://code.example.',
    ].join('\n'),
  );
});

test.each([
  ['If x<y and y>z', 'If x<y and y>z'],
  ['Replace <your-api-key> with token', 'Replace <your-api-key> with token'],
  ['Line 1<br>Line 2', 'Line 1<br>Line 2'],
  ['Address <mailto:hello@example.com>.', 'Address mailto:hello@example.com.'],
])('preserves angle-bracket prose and mailto link labels in %s', (input, expected) => {
  expect(speakableText(input)).toBe(expected);
});

test.each(['<!-- draft note -->', '<your-api-key>', '<video src="movie.mp4">\n</video>'])(
  'keeps standalone HTML blocks silent in %s',
  (html) => {
    expect(speakableText(`Before.\n\n${html}\n\nAfter.`)).toBe('Before.\nAfter.');
  },
);

test('keeps multiline HTML comments and their formula delimiters out of speech', () => {
  const markdown = [
    'Use $$ literally.',
    '<!--',
    '$$',
    'draft note',
    '-->',
    'Next $$x^2$$ example.',
  ].join('\n');
  expect(speakableText(markdown)).toBe('Use $$ literally.\nNext example.');
});

test('coalesces horizontal spaces around consecutive zero-width deletions', () => {
  expect(
    replaceInlineTextRanges('See  next', [
      { start: 4, end: 4 },
      { start: 4, end: 4 },
    ]),
  ).toBe('See next');
});

test.each([
  ['See https://example.com/a_(b)). Next', 'See). Next'],
  ['See https://example.com/a[b]].', 'See].'],
  ['See https://example.com/a{b}}!', 'See}!'],
  ['See https://example.com/a?x=1?!', 'See?!'],
  ['See "https://example.com/a" now', 'See "" now'],
  ['<https://example.com>', ''],
])('preserves punctuation around an omitted URL in %s', (input, expected) => {
  expect(speakableText(input)).toBe(expected);
});

test.each([
  ['访问 https://例子.中国/a 后继续。', '访问 后继续。'],
  ['See https://münchen.de/straße, please.', 'See, please.'],
  ['访问 https://例子.中国/路径/测试。', '访问。'],
  ['访问 https://example.com/路径/测试。', '访问。'],
  ['访问 https://[::1]:8080/?q=中文。', '访问。'],
  ['访问https://example.com查看详情', '访问查看详情'],
  ['访问https://example.com:8080查看详情', '访问查看详情'],
  ['访问https://例子.com查看详情', '访问查看详情'],
])('omits the bare URL and preserves surrounding prose in %s', (input, expected) => {
  expect(speakableText(input)).toBe(expected);
});

test.each(Array.from('.,;:!?。，！？；：、（）【】《》「」『』'))(
  'preserves %s next to an international bare URL',
  (punctuation) => {
    expect(speakableText(`访问https://例子.中国/路径${punctuation}`)).toBe(`访问${punctuation}`);
  },
);

test('omits paired display and inline TeX across their respective boundaries', () => {
  const markdown = [
    String.raw`First \(a + b\) then \[x_{1} = y\] .`,
    '',
    '$$',
    'x = 2',
    '',
    'y = 3',
    '$$',
    '',
    '\\[',
    '123',
    '\\]',
    '',
    String.raw`Joined\(x\)words and \(x \(\alpha\)\).`,
  ].join('\n');
  expect(speakableText(markdown)).toBe('First then.\nJoined words and.');
});

test.each([
  [
    'Use $$ literally.\n\nKeep this paragraph.\n\n$$x^2$$\n\nAfter.',
    'Use $$ literally.\nKeep this paragraph.\nAfter.',
  ],
  [
    '$$\n\nKeep this paragraph.\n\nNext $$x^2$$ example.',
    '$$\nKeep this paragraph.\nNext example.',
  ],
  [
    '- Use $$ literally.\n- Keep this step.\n- Next $$x^2$$ example.',
    'Use $$ literally.\nKeep this step.\nNext example.',
  ],
  ['Use $$ literally.\n# Next heading $$x^2$$ end.', 'Use $$ literally.\nNext heading end.'],
  ['First $$x^2$$ example.\n\n$$\na = b\n\nb = c\n$$\n\nAfter.', 'First example.\nAfter.'],
])('pairs each $$ formula within its scope in %s', (input, expected) => {
  expect(speakableText(input)).toBe(expected);
});

test('handles long single lines with many repeated formulas without pathological slowdown', () => {
  const repeated = Array.from({ length: 1_000 }, (_, i) => `item $$x_${i}$$`).join(' ');
  expect(speakableText(repeated)).toBe(Array.from({ length: 1_000 }, () => 'item').join(' '));
});

test('preserves money, escaped citations, empty inline and unclosed formula delimiters', () => {
  const markdown = [
    String.raw`Price $50 to $100. Cite \[1\]. Escaped \$\$ x \$\$. Empty \( \).`,
    String.raw`Open \(not finished`,
    '',
    String.raw`another paragraph \) and $$ also open \[x_1`,
  ].join('\n');
  expect(speakableText(markdown)).toBe(
    'Price $50 to $100. Cite [1]. Escaped $$ x $$. Empty ( ). Open (not finished\n' +
      'another paragraph ) and $$ also open [x_1',
  );
});

test('formula delimiters inside backtick spans and code blocks cannot pair with prose', () => {
  const markdown = [
    '``keep $$ \\[x_1\\] `` then $$ unmatched.',
    '',
    '    $$ indented formula-like text',
    '',
    '> ```text',
    '> $$ fenced formula-like text',
    '> ```',
    '',
    '> `literal \\(x\\)` and real \\(y\\).',
  ].join('\n');
  expect(speakableText(markdown)).toBe(
    'keep $$ \\[x_1\\] then $$ unmatched.\nliteral \\(x\\) and real.',
  );
});

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const md4cDirectory = 'node_modules/react-native-enriched-markdown/cpp/md4c';
const harness = 'scripts/__tests__/fixtures/enrichedMarkdownInlineMath.c';

// Both platforms parse messages with this md4c build, so its inline output is the contract the
// RaTeX renderers receive. Rendering and layout still need device acceptance.
function parseInline(documents: string[]): string[] {
  const directory = mkdtempSync(join(tmpdir(), 'enriched-inline-math-'));
  try {
    const binary = join(directory, 'inline-math');
    const args = [
      '-DMD4C_USE_UTF8=1',
      `-I${md4cDirectory}`,
      harness,
      join(md4cDirectory, 'md4c.c'),
      '-o',
      binary,
    ];
    try {
      execFileSync('cc', args);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      execFileSync('clang', args);
    }
    return execFileSync(binary, { encoding: 'utf8', input: documents.join('\x1e') })
      .split('\n')
      .slice(0, documents.length);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const cases: [markdown: string, inline: string][] = [
  // CJK prose writes inline math without surrounding spaces (#1837).
  ['设$x$为整数', '设<math>x</math>为整数'],
  ['其中$\\text{＋}$表示加', '其中<math>\\text{＋}</math>表示加'],
  ['所以$a+b=c$。', '所以<math>a+b=c</math>。'],
  ['$x$是变量', '<math>x</math>是变量'],
  ['速度$v$，时间$t$', '速度<math>v</math>，时间<math>t</math>'],
  ['質能$$E=mc^2$$方程', '質能<dmath>E=mc^2</dmath>方程'],
  ['費用は$x$円です', '費用は<math>x</math>円です'],
  ['변수$x$를', '변수<math>x</math>를'],
  ['**粗体$x$**', '<strong>粗体<math>x</math></strong>'],
  ['| $a$ | 设$b$为 |\n| --- | --- |\n| 1 | 2 |', '<math>a</math>设<math>b</math>为12'],
  // A math span is literal TeX, so emphasis outside cannot claim a `*` or `_` inside it.
  ['*x $a*b$ y', '*x <math>a*b</math> y'],
  ['_x $a_b$ y_', '<em>x <math>a_b</math> y</em>'],
  ['*斜体* $a*b$', '<em>斜体</em> <math>a*b</math>'],
  // Upstream behavior that must not change.
  ['设 $x$ 为整数', '设 <math>x</math> 为整数'],
  ['English$x$text', 'English$x$text'],
  ['price $5 and $10 total', 'price $5 and $10 total'],
  ['I have $5, you have $10.', 'I have $5, you have $10.'],
  ['价格$5，折后$3', '价格$5，折后$3'],
  ['\\$5 和 \\$10', '$5 和 $10'],
  ['`$x$` 和 $y$', '<code>$x$</code> 和 <math>y</math>'],
  ['**$x$**', '<strong><math>x</math></strong>'],
  ['$a$ *b* $c$', '<math>a</math> <em>b</em> <math>c</math>'],
  ['~~$x$~~', '<del><math>x</math></del>'],
  ['2^10^ 和 $2^{10}$', '2<sup>10</sup> 和 <math>2^{10}</math>'],
  // Currency inside emphasis or adjacent to prose must not hijack a later formula opener.
  ['**$5** and $\\frac{1}{2}$', '<strong>$5</strong> and <math>\\frac{1}{2}</math>'],
  ['**$5** and **$\\alpha$**', '<strong>$5</strong> and <strong><math>\\alpha</math></strong>'],
  [
    '**价格 $5**，其中 $\\text{＋}$ 表示加',
    '<strong>价格 $5</strong>，其中 <math>\\text{＋}</math> 表示加',
  ],
  [
    '**价格$5**，其中$\\text{＋}$表示加',
    '<strong>价格$5</strong>，其中<math>\\text{＋}</math>表示加',
  ],
  ['*$5* and $-x$', '<em>$5</em> and <math>-x</math>'],
  ['~~$5~~ and $(a+b)$', '<del>$5</del> and <math>(a+b)</math>'],
  ['**$5** (in $)', '<strong>$5</strong> (in $)'],
  ['价格$5，其中$\\text{＋}$表示加', '价格$5，其中<math>\\text{＋}</math>表示加'],
  ['price $5 and $\\frac{1}{2}$', 'price $5 and <math>\\frac{1}{2}</math>'],
  // Fullwidth digits remain literal currency; halfwidth Katakana and spaced display math work.
  ['price $５ and $１０', 'price $５ and $１０'],
  ['价格$５，折后$３', '价格$５，折后$３'],
  ['ﾃｽﾄ$x$ﾃｽﾄ', 'ﾃｽﾄ<math>x</math>ﾃｽﾄ'],
  ['$$ E = mc^2 $$', '<dmath> E = mc^2 </dmath>'],
  // Operators inside math still cannot be paired with emphasis or superscripts outside.
  ['*x $a*b$ y*', '<em>x <math>a*b</math> y</em>'],
  ['_x $a_{1}$ y_', '<em>x <math>a_{1}</math> y</em>'],
  ['2^10 $a^2$', '2^10 <math>a^2</math>'],
];

describe('Enriched Markdown inline math parsing', () => {
  test('recognizes inline math in CJK prose and keeps its TeX literal', () => {
    const markdown = cases.map(([source]) => source);
    expect(parseInline(markdown)).toEqual(cases.map(([, inline]) => inline));
  });
});

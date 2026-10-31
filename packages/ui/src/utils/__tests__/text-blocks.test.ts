import { splitTextBlocks } from '../text-blocks';

const limits = { maxBlockLength: 20, maxBlockLines: 3, maxLineLength: 8 };

it('keeps short text in one block', () => {
  expect(splitTextBlocks('a\nb', limits)).toEqual(['a\nb']);
  expect(splitTextBlocks('', limits)).toEqual(['']);
});

it('bounds every block by rows and characters and preserves the text', () => {
  const text = Array.from({ length: 10 }, (_, index) => `line ${index}`).join('\n');
  const blocks = splitTextBlocks(text, limits);

  expect(blocks.length).toBeGreaterThan(1);
  for (const block of blocks) {
    expect(block.split('\n').length).toBeLessThanOrEqual(limits.maxBlockLines);
    expect(block.length).toBeLessThanOrEqual(limits.maxBlockLength);
  }
  expect(blocks.join('\n')).toBe(text);
});

it('splits a line without breaks into bounded rows without separating a surrogate pair', () => {
  const line = `abcdefg🌸${'x'.repeat(30)}`;
  const rows = splitTextBlocks(line, {
    ...limits,
    maxBlockLines: 100,
    maxBlockLength: 1000,
  })[0].split('\n');

  expect(rows[0]).toBe('abcdefg');
  expect(rows.every((row) => row.length <= limits.maxLineLength)).toBe(true);
  expect(rows.join('')).toBe(line);
});

it.each(['\n', '\r\n', '\r', '\v', '\f', '\u0085', '\u2028', '\u2029'])(
  'bounds thousands of short lines separated by %j',
  (separator) => {
    const lines = Array.from({ length: 5_000 }, (_, index) => `line ${index}`);
    const blocks = splitTextBlocks(lines.join(separator));

    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      expect(block.length).toBeLessThanOrEqual(1000);
      expect(block.split('\n').length).toBeLessThanOrEqual(20);
    }
    expect(blocks.join('\n')).toBe(lines.join('\n'));
  },
);

it('retains empty lines and the final newline across block boundaries', () => {
  const text = `start${'\n'.repeat(5_000)}end\n`;
  const blocks = splitTextBlocks(text);

  expect(blocks.every((block) => block.split('\n').length <= 20)).toBe(true);
  expect(blocks.join('\n')).toBe(text);
});

it('bounds an unbroken Unicode result without losing characters', () => {
  const text = `文${'😀'.repeat(50_000)}末尾`;
  const blocks = splitTextBlocks(text);

  expect(blocks.every((block) => block.length <= 1000 && !/[\uD800-\uDBFF]$/.test(block))).toBe(
    true,
  );
  expect(blocks.join('')).toBe(text);
});

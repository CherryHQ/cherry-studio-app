import { splitTextBlocks } from '../textBlocks';

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

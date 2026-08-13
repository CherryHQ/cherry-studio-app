import {
  resolveReplyReadAloudChunkLength,
  splitReplyReadAloudText,
} from '../splitReplyReadAloudText';

describe('resolveReplyReadAloudChunkLength', () => {
  it('uses the default when the native maximum is unavailable', () => {
    expect(resolveReplyReadAloudChunkLength(undefined)).toBe(3000);
  });

  it('caps a large native maximum at the feature default', () => {
    expect(resolveReplyReadAloudChunkLength(10_000)).toBe(3000);
  });

  it('keeps a safety buffer below a finite native maximum', () => {
    expect(resolveReplyReadAloudChunkLength(2000)).toBe(1900);
  });

  it('always returns a usable positive length', () => {
    expect(resolveReplyReadAloudChunkLength(100)).toBe(1);
    expect(resolveReplyReadAloudChunkLength(-10)).toBe(1);
  });
});

describe('splitReplyReadAloudText', () => {
  it('returns no chunks for empty or whitespace-only text', () => {
    expect(splitReplyReadAloudText('', 10)).toEqual([]);
    expect(splitReplyReadAloudText(' \n\t ', 10)).toEqual([]);
  });

  it('prefers a paragraph boundary over a later sentence boundary', () => {
    const text = 'Alpha.\n\nBeta sentence. Tail';

    expect(splitReplyReadAloudText(text, 22)).toEqual(['Alpha.\n\n', 'Beta sentence. Tail']);
  });

  it('uses CJK and Latin sentence punctuation when no paragraph boundary fits', () => {
    expect(splitReplyReadAloudText('第一句。第二句！Third? Tail', 12)).toEqual([
      '第一句。第二句！',
      'Third? Tail',
    ]);
  });

  it('falls back to a whitespace boundary', () => {
    expect(splitReplyReadAloudText('alpha beta gamma', 11)).toEqual(['alpha beta ', 'gamma']);
  });

  it('hard-splits text with no readable boundary', () => {
    expect(splitReplyReadAloudText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('never splits an emoji surrogate pair or exceeds the UTF-16 limit', () => {
    const text = 'ab😀cd😀ef';
    const chunks = splitReplyReadAloudText(text, 3);

    expect(chunks).toEqual(['ab', '😀c', 'd😀', 'ef']);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((chunk) => chunk.length <= 3)).toBe(true);
    expect(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk))).toBe(true);
    expect(chunks.every((chunk) => !/^[\uDC00-\uDFFF]/.test(chunk))).toBe(true);
  });

  it('preserves all trimmed spoken content and separator order', () => {
    const text = '  One sentence.  Two words\n\nFinal  ';
    const chunks = splitReplyReadAloudText(text, 16);

    expect(chunks.join('')).toBe(text.trim());
    expect(chunks.every((chunk) => chunk.length <= 16)).toBe(true);
  });
});

import { projectMarkdownInlineForSpeech } from '../projectMarkdownInlineForSpeech';

describe('projectMarkdownInlineForSpeech', () => {
  test('applies the rule of three when both runs can participate in emphasis', () => {
    expect(projectMarkdownInlineForSpeech('*a**b*')).toBe('a**b');
  });

  test('invalidates openers that were crossed by a nearer match', () => {
    expect(projectMarkdownInlineForSpeech('__*__\\a*')).toBe('*\\a*');
  });

  test('keeps tilde runs whose length cannot form strikethrough', () => {
    expect(projectMarkdownInlineForSpeech('~~~triple~~~')).toBe('~~~triple~~~');
  });

  test.each([
    ['snake_case', 'snake_case'],
    ['a_b_c_d', 'a_b_c_d'],
    ['2*3*4', '2*3*4'],
    ['\\*literal\\*', '*literal*'],
    ['\\\\*paired*', '\\paired'],
  ])('preserves literal or escaped delimiters in %p', (markdown, expected) => {
    expect(projectMarkdownInlineForSpeech(markdown)).toBe(expected);
  });

  test.each([
    ['* left*', '* left*'],
    ['*right *', '*right *'],
    ['(**inside**)', '(inside)'],
    ['word_with_underscores', 'word_with_underscores'],
  ])('honors delimiter flanking in %p', (markdown, expected) => {
    expect(projectMarkdownInlineForSpeech(markdown)).toBe(expected);
  });

  test('does not pair delimiters across lines', () => {
    expect(projectMarkdownInlineForSpeech('*first\nsecond*')).toBe('*first\nsecond*');
  });
});

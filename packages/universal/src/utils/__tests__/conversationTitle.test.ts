import {
  buildFirstUserMessageTitle,
  normalizeConversationTitle,
  sanitizeConversationTitle,
  truncateFirstUserMessageTitleSource,
} from '../conversationTitle';

describe('conversationTitle', () => {
  it.each([
    [' "Quoted"\nTitle ', 'Quoted Title'],
    ["It's\r\nfine", 'It s fine'],
    ['plain title', 'plain title'],
  ])('sanitizes quotes and newlines: %s', (input, expected) => {
    expect(sanitizeConversationTitle(input)).toBe(expected);
  });

  it('normalizes case and whitespace for comparisons', () => {
    expect(normalizeConversationTitle('  Mixed\n\tCASE   Title  ')).toBe('mixed case title');
  });

  it('truncates without leaving a lone surrogate', () => {
    const source = truncateFirstUserMessageTitleSource(`${'字'.repeat(49)}😀${'文'.repeat(20)}`);
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(loneSurrogate.test(source)).toBe(false);
    expect(source).toBe('字'.repeat(49));
  });

  it('builds an empty title for whitespace-only input', () => {
    expect(buildFirstUserMessageTitle(' \n\t ')).toBe('');
  });
});

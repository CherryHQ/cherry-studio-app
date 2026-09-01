import { createCodeBlockMarkdown } from '../createCodeBlockMarkdown';

describe('createCodeBlockMarkdown', () => {
  it('uses the requested language for ordinary code', () => {
    expect(createCodeBlockMarkdown('const answer = 42;', 'typescript')).toBe(
      '```typescript\nconst answer = 42;\n```',
    );
  });

  it('chooses a fence longer than every backtick run in the content', () => {
    expect(createCodeBlockMarkdown('before\n```\nafter', 'markdown')).toBe(
      '````markdown\nbefore\n```\nafter\n````',
    );
  });

  it('drops an unsafe language info string', () => {
    expect(createCodeBlockMarkdown('value', 'typescript\n```')).toBe('```\nvalue\n```');
  });

  it('does not add another content newline when one is already present', () => {
    expect(createCodeBlockMarkdown('value\n')).toBe('```\nvalue\n```');
  });
});

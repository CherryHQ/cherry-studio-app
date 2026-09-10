import { createCodeBlockMarkdown } from '../createCodeBlockMarkdown';

describe('createCodeBlockMarkdown', () => {
  it('keeps a streaming fence open so native code highlighting waits for completion', () => {
    expect(createCodeBlockMarkdown('const value =', 'typescript', true)).toBe(
      '```typescript\nconst value =',
    );
    expect(createCodeBlockMarkdown('before\n```\nafter', 'markdown', true)).toBe(
      '````markdown\nbefore\n```\nafter',
    );
  });
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

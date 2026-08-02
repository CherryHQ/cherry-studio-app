import { createMarkdownTypographyStyle } from '../markdownTypography';

describe('markdown typography', () => {
  test('maps Markdown roles onto the global scale', () => {
    const style = createMarkdownTypographyStyle(1);

    expect(style.paragraph).toEqual({ fontSize: 18, lineHeight: 28 });
    expect(style.h1).toEqual({ fontSize: 36, lineHeight: 40 });
    expect(style.h2).toEqual({ fontSize: 30, lineHeight: 36 });
    expect(style.codeBlock).toEqual({ fontSize: 16, lineHeight: 24 });
    expect(style.table).toEqual({ fontSize: 16, lineHeight: 24 });
  });
});

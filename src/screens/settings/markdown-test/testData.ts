// Complex markdown test data for benchmarking
export const COMPLEX_MARKDOWN = `# 🚀 Nitro Markdown

Welcome to the **high-performance** markdown parser powered by \`md4c\` and **Nitro Modules**.

## Features Showcase

This parser supports *all* the features you'd expect:

- **Bold text** with double asterisks
- *Italic text* with single asterisks
- ~~Strikethrough text~~ (GFM)
- \`console.log('Hello World')\` snippets
- [Links](https://github.com)
- ![Landscape](https://picsum.photos/300/200 "Random image from Picsum")

## Some Lists / Tasks

**Quick actions:**

- [ ] Reply to Sarah's email about the \`Series A\` discussion
- [ ] Update your notes on the *TechCrunch* meeting
- [x] Review the [shared document](https://docs.example.com/pitch) before Thursday

**List:**

- Reply to Sarah's email about the \`Series A\` discussion
- Update your notes on the *TechCrunch* meeting
- Review the [shared document](https://docs.example.com/pitch) before Thursday

#### Images
- ![Landscape](https://picsum.photos/300/200 "Random image from Picsum")
- ![City](https://picsum.photos/seed/markdown/300/150 "City skyline")


## Advanced GFM Features

### Task Lists
- [x] Implement md4c parser
- [x] Create Nitro bindings
- [x] Build AST converter
- [ ] Add syntax highlighting
- [ ] Implement caching

### Tables with Complex Content
| Feature | Description | Status | Performance |
|:--------|:------------|:-------|:------------|
| JSI Binding | Direct JS ↔️ C++ communication | ✅ | Microseconds |
| Native Threading | Background processing | ✅ | Optimized |
| Zero-Copy | No data duplication | ✅ | Memory efficient |
| Math Support | LaTeX expressions | ✅ | Full featured |
| GFM Tables | Advanced table rendering | ✅ | Complete spec |

## LaTeX Mathematics

### Inline Math
- Simple: $E = mc^2$
- Complex: $\\frac{d}{dx}[x^n] = nx^{n-1}$
- Greek letters: $\\alpha + \\beta = \\gamma$
- Subscripts: $x_1, x_2, \\dots, x_n$
- Superscripts: $x^2, y^{n+1}, e^{\\pi i}$

### Block Math (Display Mode)
The quadratic formula:

$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$

Pythagorean theorem:

$a^2 + b^2 = c^2$

Matrix operations:

$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\times \\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} ax + by \\\\ cx + dy \\end{pmatrix}$

## Code Blocks with Syntax Highlighting

### TypeScript
\`\`\`typescript
import { parseMarkdown, parseMarkdownWithOptions } from 'react-native-nitro-markdown';

interface ParserOptions {
  gfm?: boolean;
  math?: boolean;
}

const parseWithGFM = (text: string): MarkdownNode => {
  return parseMarkdownWithOptions(text, {
    gfm: true,
    math: true
  });
};
\`\`\`

### C++ (Native Implementation)
\`\`\`cpp
#include "MD4CParser.hpp"

std::shared_ptr<MarkdownNode> parseMarkdown(
    const std::string& text,
    const ParserOptions& options
) {
    MD4CParser parser;
    return parser.parse(text, options);
}
\`\`\`

### Complex Nested Structures

#### Deeply Nested Lists
1. First level ordered item
   - Second level unordered
   - Another second level
     1. Third level ordered
     2. Another third level
        - Fourth level unordered
        - More fourth level items
   - Back to second level
2. Second first level item
   1. Nested ordered in second item
   2. Another nested ordered

#### Blockquotes Within Lists
1. First item with blockquote:
   > This is a blockquote inside a list item
   >
   > It can span multiple lines
   > And contain **formatting**

2. Second item
   - Nested bullet with blockquote:
     > Another blockquote
     > With multiple paragraphs
     >
     > And even more content

## Horizontal Rules and Separators

Content above first rule

---

Content between rules

***

More content between rules

___

Content below rules

## Unicode and International Content

### Multiple Languages
- English: Hello world! 🌍
- Español: ¡Hola mundo! 🌎
- Français: Bonjour le monde! 🌍
- Deutsch: Hallo Welt! 🌍
- 中文: 你好世界！ 🌏
- 日本語: こんにちは世界！ 🌸
- العربية: مرحبا بالعالم! 🌙

### Special Characters and Symbols
- Mathematical: ∫ ∑ ∏ √ ∞ ≠ ≈ ≤ ≥
- Arrows: ← → ↑ ↓ ↔ ↕ ⇄ ⇅
- Currency: $ € ¥ £ ₽ ₿ ¢ ₩ ₦ ₫
- Legal: © ® ™ § ¶ † ‡
- Fractions: ½ ⅓ ¼ ¾ ⅛ ⅜ ⅝ ⅞

## Performance Test Patterns

### Repeated Patterns
**Bold text** repeated for *performance testing* with \`code blocks\` and [links](url) to ensure the parser handles repetition efficiently without memory leaks or performance degradation.

### Large Content Sections
This section contains intentionally large blocks of content to test how well the parser scales with document size. The content includes various markdown elements mixed together in realistic patterns that would appear in actual documentation or blog posts.

By including diverse content types - headings, paragraphs, lists, tables, code blocks, math expressions, and international text - we create a comprehensive test that exercises all aspects of the markdown parsing engine.

The goal is to ensure that performance remains consistent regardless of content complexity or document length, providing users with reliable and fast markdown processing capabilities.

### Stress Testing Elements
- Multiple consecutive code blocks
- Tables with many columns and rows
- Deeply nested list structures
- Complex mathematical expressions
- Mixed inline formatting combinations
- Large blocks of plain text
- Unicode characters from multiple languages
- Special symbols and emoji combinations

This comprehensive test suite validates that the parser maintains high performance and accuracy across all supported markdown features and edge cases.`

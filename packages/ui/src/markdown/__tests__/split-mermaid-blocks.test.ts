import MarkdownIt from 'markdown-it';

import { splitMermaidBlocks } from '../split-mermaid-blocks';

describe('splitMermaidBlocks', () => {
  test('preserves ordinary Markdown verbatim', () => {
    const markdown = 'Text with `mermaid` and $x$.\r\n\r\n```ts\r\nconst x = 1;\r\n```';
    expect(splitMermaidBlocks(markdown, false)).toEqual([{ kind: 'markdown', key: '0', markdown }]);
  });

  test('extracts complete diagrams in order and preserves their source fallback', () => {
    const first = '```mermaid\nflowchart LR\nA[开始] --> B[完成]\n```\n';
    const second = '~~~MERMAID\npie\n"A" : 1\n~~~~\n';
    const parts = splitMermaidBlocks(`Before\n\n${first}\nBetween\n\n${second}\nAfter`, false);

    expect(parts.map((part) => part.kind)).toEqual([
      'markdown',
      'mermaid',
      'markdown',
      'mermaid',
      'markdown',
    ]);
    expect(parts[1]).toMatchObject({
      markdown: first,
      source: 'flowchart LR\nA[开始] --> B[完成]\n',
    });
    expect(parts[3]).toMatchObject({ markdown: second, source: 'pie\n"A" : 1\n' });
    expect(parts.map((part) => part.markdown).join('')).toBe(
      `Before\n\n${first}\nBetween\n\n${second}\nAfter`,
    );
  });

  test.each([
    '> ```mermaid\n> flowchart LR\n> A --> B\n> ```',
    '- Item\n\n  ```mermaid\n  flowchart LR\n  A --> B\n  ```',
    '    ```mermaid\n    flowchart LR\n    A --> B\n    ```',
    '````markdown\n```mermaid\nflowchart LR\nA --> B\n```\n````',
    '<pre>\n```mermaid\nflowchart LR\nA --> B\n```\n</pre>',
    '```mermaid-example\nflowchart LR\nA --> B\n```',
  ])('keeps nested containers and code examples intact: %s', (markdown) => {
    expect(splitMermaidBlocks(markdown, false)).toEqual([{ kind: 'markdown', key: '0', markdown }]);
  });

  test.each([
    '```mermaid\nflowchart LR\nA -->',
    '````mermaid\nflowchart LR\nA --> B\n```',
    '```mermaid\nflowchart LR\nA --> B\n~~~',
    '```mermaid\nflowchart LR\nA --> B\n``` more source',
  ])('retains incomplete fences as code: %s', (markdown) => {
    expect(splitMermaidBlocks(markdown, true)).toEqual([{ kind: 'markdown', key: '0', markdown }]);
    expect(splitMermaidBlocks(markdown, false)).toEqual([{ kind: 'markdown', key: '0', markdown }]);
  });

  test('waits for a completed closing line during streaming, but accepts EOF when finished', () => {
    const markdown = '```mermaid\nflowchart LR\nA --> B\n```';
    expect(splitMermaidBlocks(markdown, true)[0].kind).toBe('markdown');
    expect(splitMermaidBlocks(`${markdown}\n`, true)[0].kind).toBe('mermaid');
    expect(splitMermaidBlocks(markdown, false)[0].kind).toBe('mermaid');
  });

  test('uses source offsets with CRLF and keeps completed diagram keys stable as the tail grows', () => {
    const markdown = 'Before\r\n\r\n```mermaid\r\nflowchart LR\r\nA --> B\r\n```\r\n';
    const parts = splitMermaidBlocks(markdown, true);
    expect(parts[1]).toMatchObject({
      kind: 'mermaid',
      key: '10',
      source: 'flowchart LR\nA --> B\n',
    });
    expect(parts.map((part) => part.markdown).join('')).toBe(markdown);
    expect(splitMermaidBlocks(`${markdown}\r\nMore text`, true)[1]).toEqual(parts[1]);
  });

  test('preserves reference links across diagram boundaries and an unfinished trailing fence', () => {
    const markdown =
      '[Before][docs]\n\n```mermaid\nflowchart LR\nA --> B\n```\n\n' +
      '[After][docs]\n\n[docs]: https://example.com/guide "A guide"\n\n```ts\nconst value =';
    const parts = splitMermaidBlocks(markdown, true);
    const parser = new MarkdownIt();
    for (const part of parts.filter((item) => item.kind === 'markdown')) {
      const links = parser
        .parse(part.markdown, {})
        .flatMap((token) => token.children ?? [])
        .filter((token) => token.type === 'link_open');
      expect(links).toHaveLength(1);
      expect(links[0].attrGet('href')).toBe('https://example.com/guide');
      expect(links[0].attrGet('title')).toBe('A guide');
    }
    expect(parts[1]).toMatchObject({ kind: 'mermaid', source: 'flowchart LR\nA --> B\n' });
  });
});

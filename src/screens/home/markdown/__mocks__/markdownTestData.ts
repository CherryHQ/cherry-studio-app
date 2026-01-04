import type { MarkdownNode } from 'react-native-nitro-markdown'

// Factory for creating MarkdownNode objects
export const createMarkdownNode = (type: MarkdownNode['type'], overrides: Partial<MarkdownNode> = {}): MarkdownNode =>
  ({
    type,
    ...overrides
  }) as MarkdownNode

export const createTextNode = (content: string): MarkdownNode =>
  ({
    type: 'text',
    content
  }) as MarkdownNode

export const createBoldNode = (children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'bold',
    children
  }) as MarkdownNode

export const createItalicNode = (children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'italic',
    children
  }) as MarkdownNode

export const createStrikethroughNode = (children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'strikethrough',
    children
  }) as MarkdownNode

export const createParagraphNode = (children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'paragraph',
    children
  }) as MarkdownNode

export const createHeadingNode = (level: 1 | 2 | 3 | 4 | 5 | 6, children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'heading',
    level,
    children
  }) as MarkdownNode

export const createCodeBlockNode = (content: string, language?: string): MarkdownNode =>
  ({
    type: 'code_block',
    content,
    language
  }) as MarkdownNode

export const createCodeInlineNode = (content: string): MarkdownNode =>
  ({
    type: 'code_inline',
    content
  }) as MarkdownNode

export const createLinkNode = (href: string, children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'link',
    href,
    children
  }) as MarkdownNode

export const createImageNode = (href: string, title?: string): MarkdownNode =>
  ({
    type: 'image',
    href,
    title
  }) as MarkdownNode

export const createListNode = (ordered: boolean, children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'list',
    ordered,
    children
  }) as MarkdownNode

export const createListItemNode = (children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'list_item',
    children
  }) as MarkdownNode

export const createTaskListItemNode = (checked: boolean, children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'task_list_item',
    checked,
    children
  }) as MarkdownNode

export const createBlockquoteNode = (children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'blockquote',
    children
  }) as MarkdownNode

export const createTableNode = (children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'table',
    children
  }) as MarkdownNode

export const createTableHeadNode = (children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'table_head',
    children
  }) as MarkdownNode

export const createTableBodyNode = (children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'table_body',
    children
  }) as MarkdownNode

export const createTableRowNode = (children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'table_row',
    children
  }) as MarkdownNode

export const createTableCellNode = (isHeader: boolean, children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'table_cell',
    isHeader,
    children
  }) as MarkdownNode

export const createMathInlineNode = (content: string): MarkdownNode =>
  ({
    type: 'math_inline',
    content
  }) as MarkdownNode

export const createMathBlockNode = (content: string): MarkdownNode =>
  ({
    type: 'math_block',
    content
  }) as MarkdownNode

export const createSoftBreakNode = (): MarkdownNode =>
  ({
    type: 'soft_break'
  }) as MarkdownNode

export const createLineBreakNode = (): MarkdownNode =>
  ({
    type: 'line_break'
  }) as MarkdownNode

export const createHorizontalRuleNode = (): MarkdownNode =>
  ({
    type: 'horizontal_rule'
  }) as MarkdownNode

export const createDocumentNode = (children: MarkdownNode[]): MarkdownNode =>
  ({
    type: 'document',
    children
  }) as MarkdownNode

// Complex test fixtures
export const createSimpleDocument = (): MarkdownNode =>
  createDocumentNode([createParagraphNode([createTextNode('Hello World')])])

export const createRichDocument = (): MarkdownNode =>
  createDocumentNode([
    createHeadingNode(1, [createTextNode('Title')]),
    createParagraphNode([
      createTextNode('This is '),
      createBoldNode([createTextNode('bold')]),
      createTextNode(' text.')
    ]),
    createCodeBlockNode('const x = 1;', 'javascript')
  ])

export const createNestedInlineDocument = (): MarkdownNode =>
  createDocumentNode([
    createParagraphNode([
      createTextNode('Normal '),
      createBoldNode([createItalicNode([createTextNode('bold italic')])]),
      createTextNode(' text')
    ])
  ])

export const createMixedContentDocument = (): MarkdownNode =>
  createDocumentNode([
    createHeadingNode(1, [createTextNode('Heading')]),
    createParagraphNode([createTextNode('Paragraph text')]),
    createCodeBlockNode('code', 'js'),
    createBlockquoteNode([createParagraphNode([createTextNode('Quote')])])
  ])

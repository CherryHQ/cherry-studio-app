import React, { useMemo } from 'react'
import { Text } from 'react-native'
import type { MarkdownNode } from 'react-native-nitro-markdown'
import { parseMarkdownWithOptions } from 'react-native-nitro-markdown'

import {
  NitroBlockquote,
  NitroBold,
  NitroCodeBlock,
  NitroCodeInline,
  NitroDocument,
  NitroHeading,
  NitroHorizontalRule,
  NitroImage,
  NitroItalic,
  NitroLineBreak,
  NitroLink,
  NitroList,
  NitroListItem,
  NitroMathBlock,
  NitroMathInline,
  NitroParagraph,
  NitroSoftBreak,
  NitroStrikethrough,
  NitroTable,
  NitroTableBody,
  NitroTableCell,
  NitroTableHead,
  NitroTableRow,
  NitroTaskListItem,
  NitroText
} from './nitroItem'

interface NitroMarkdownProps {
  content: string
}

export function NitroMarkdown({ content }: NitroMarkdownProps) {
  const ast = useMemo(() => {
    return parseMarkdownWithOptions(content, { gfm: true, math: true })
  }, [content])

  return <NodeRenderer node={ast} />
}

interface NodeRendererProps {
  node: MarkdownNode
}

function NodeRenderer({ node }: NodeRendererProps) {
  const renderChildren = () => {
    if (!node.children) return null
    return node.children.map((child, index) => <NodeRenderer key={index} node={child} />)
  }

  switch (node.type) {
    case 'document':
      return <NitroDocument>{renderChildren()}</NitroDocument>

    case 'paragraph':
      return <NitroParagraph>{renderChildren()}</NitroParagraph>

    case 'heading':
      return <NitroHeading level={(node.level || 1) as 1 | 2 | 3 | 4 | 5 | 6}>{renderChildren()}</NitroHeading>

    case 'text':
      return <NitroText content={node.content || ''} />

    case 'soft_break':
      return <NitroSoftBreak />

    case 'line_break':
      return <NitroLineBreak />

    case 'bold':
      return <NitroBold>{renderChildren()}</NitroBold>

    case 'italic':
      return <NitroItalic>{renderChildren()}</NitroItalic>

    case 'strikethrough':
      return <NitroStrikethrough>{renderChildren()}</NitroStrikethrough>

    case 'code_inline':
      return <NitroCodeInline content={node.content || ''} />

    case 'code_block':
      return <NitroCodeBlock content={node.content || ''} language={node.language} />

    case 'link':
      return <NitroLink href={node.href}>{renderChildren()}</NitroLink>

    case 'image':
      return <NitroImage src={node.href} alt={node.title} />

    case 'list':
      return <NitroList ordered={node.ordered}>{renderChildren()}</NitroList>

    case 'list_item':
      return <NitroListItem>{renderChildren()}</NitroListItem>

    case 'task_list_item':
      return <NitroTaskListItem checked={node.checked}>{renderChildren()}</NitroTaskListItem>

    case 'blockquote':
      return <NitroBlockquote>{renderChildren()}</NitroBlockquote>

    case 'horizontal_rule':
      return <NitroHorizontalRule />

    case 'table':
      return <NitroTable>{renderChildren()}</NitroTable>

    case 'table_head':
      return <NitroTableHead>{renderChildren()}</NitroTableHead>

    case 'table_body':
      return <NitroTableBody>{renderChildren()}</NitroTableBody>

    case 'table_row':
      return <NitroTableRow>{renderChildren()}</NitroTableRow>

    case 'table_cell':
      return <NitroTableCell isHeader={node.isHeader}>{renderChildren()}</NitroTableCell>

    case 'math_inline':
      return <NitroMathInline content={node.content || ''} />

    case 'math_block':
      return <NitroMathBlock content={node.content || ''} />

    case 'html_block':
    case 'html_inline':
      return null

    default:
      if (node.children) {
        return <>{renderChildren()}</>
      }
      if (node.content) {
        return <Text>{node.content}</Text>
      }
      return null
  }
}

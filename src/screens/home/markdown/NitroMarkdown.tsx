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

function getTextContent(node: MarkdownNode): string {
  if (node.content) return node.content
  if (!node.children) return ''
  return node.children.map(getTextContent).join('')
}

const INLINE_TYPES = new Set([
  'text',
  'bold',
  'italic',
  'strikethrough',
  'link',
  'code_inline',
  'html_inline',
  'math_inline',
  'soft_break',
  'line_break'
])

function isInline(type: MarkdownNode['type']): boolean {
  return INLINE_TYPES.has(type)
}

function NodeRenderer({ node }: NodeRendererProps) {
  const renderChildren = () => {
    if (!node.children) return null

    const elements: React.ReactNode[] = []
    let currentInlineGroup: MarkdownNode[] = []

    const flushInlineGroup = () => {
      if (currentInlineGroup.length > 0) {
        elements.push(
          <Text key={`inline-group-${elements.length}`} className="text-foreground">
            {currentInlineGroup.map((child, index) => (
              <NodeRenderer key={index} node={child} />
            ))}
          </Text>
        )
        currentInlineGroup = []
      }
    }

    node.children.forEach((child, index) => {
      if (isInline(child.type)) {
        currentInlineGroup.push(child)
      } else {
        flushInlineGroup()
        elements.push(<NodeRenderer key={`block-${index}`} node={child} />)
      }
    })

    flushInlineGroup()
    return elements
  }

  switch (node.type) {
    case 'document':
      return <NitroDocument>{renderChildren()}</NitroDocument>

    case 'paragraph':
      return (
        <NitroParagraph>
          {node.children?.map((child, index) => <NodeRenderer key={index} node={child} />)}
        </NitroParagraph>
      )

    case 'heading':
      return (
        <NitroHeading level={(node.level || 1) as 1 | 2 | 3 | 4 | 5 | 6}>
          {node.children?.map((child, index) => <NodeRenderer key={index} node={child} />)}
        </NitroHeading>
      )

    case 'text':
      return <NitroText content={node.content || ''} />

    case 'soft_break':
      return <NitroSoftBreak />

    case 'line_break':
      return <NitroLineBreak />

    case 'bold':
      return <NitroBold>{node.children?.map((child, index) => <NodeRenderer key={index} node={child} />)}</NitroBold>

    case 'italic':
      return <NitroItalic>{node.children?.map((child, index) => <NodeRenderer key={index} node={child} />)}</NitroItalic>

    case 'strikethrough':
      return (
        <NitroStrikethrough>
          {node.children?.map((child, index) => <NodeRenderer key={index} node={child} />)}
        </NitroStrikethrough>
      )

    case 'code_inline':
      return <NitroCodeInline content={node.content || ''} />

    case 'code_block':
      return <NitroCodeBlock content={getTextContent(node)} language={node.language} />

    case 'link':
      return (
        <NitroLink href={node.href}>
          {node.children?.map((child, index) => <NodeRenderer key={index} node={child} />)}
        </NitroLink>
      )

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
      return <NitroMathInline content={getTextContent(node)} />

    case 'math_block':
      return <NitroMathBlock content={getTextContent(node)} />

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

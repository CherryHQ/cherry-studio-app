import React, { useMemo } from 'react'
import { Text } from 'react-native'
import type { MarkdownNode } from 'react-native-nitro-markdown'
import { parseMarkdownWithOptions } from 'react-native-nitro-markdown'

import {
  MarkdownBlockquote,
  MarkdownBold,
  MarkdownCodeBlock,
  MarkdownCodeInline,
  MarkdownDocument,
  MarkdownHeading,
  MarkdownHorizontalRule,
  MarkdownImage,
  MarkdownItalic,
  MarkdownLineBreak,
  MarkdownLink,
  MarkdownList,
  MarkdownListItem,
  MarkdownMathBlock,
  MarkdownMathInline,
  MarkdownParagraph,
  MarkdownSoftBreak,
  MarkdownStrikethrough,
  MarkdownTable,
  MarkdownTableBody,
  MarkdownTableCell,
  MarkdownTableHead,
  MarkdownTableRow,
  MarkdownTaskListItem,
  MarkdownText
} from './markdownItem'

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
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
          <Text key={`inline-group-${elements.length}`} className="text-base text-foreground">
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
      return <MarkdownDocument>{renderChildren()}</MarkdownDocument>

    case 'paragraph':
      return (
        <MarkdownParagraph>
          {node.children?.map((child, index) => <NodeRenderer key={index} node={child} />)}
        </MarkdownParagraph>
      )

    case 'heading':
      return (
        <MarkdownHeading level={(node.level || 1) as 1 | 2 | 3 | 4 | 5 | 6}>
          {node.children?.map((child, index) => <NodeRenderer key={index} node={child} />)}
        </MarkdownHeading>
      )

    case 'text':
      return <MarkdownText content={node.content || ''} />

    case 'soft_break':
      return <MarkdownSoftBreak />

    case 'line_break':
      return <MarkdownLineBreak />

    case 'bold':
      return <MarkdownBold>{node.children?.map((child, index) => <NodeRenderer key={index} node={child} />)}</MarkdownBold>

    case 'italic':
      return <MarkdownItalic>{node.children?.map((child, index) => <NodeRenderer key={index} node={child} />)}</MarkdownItalic>

    case 'strikethrough':
      return (
        <MarkdownStrikethrough>
          {node.children?.map((child, index) => <NodeRenderer key={index} node={child} />)}
        </MarkdownStrikethrough>
      )

    case 'code_inline':
      return <MarkdownCodeInline content={node.content || ''} />

    case 'code_block':
      return <MarkdownCodeBlock content={getTextContent(node)} language={node.language} />

    case 'link':
      return (
        <MarkdownLink href={node.href}>
          {node.children?.map((child, index) => <NodeRenderer key={index} node={child} />)}
        </MarkdownLink>
      )

    case 'image':
      return <MarkdownImage src={node.href} alt={node.title} />

    case 'list':
      return <MarkdownList ordered={node.ordered}>{renderChildren()}</MarkdownList>

    case 'list_item':
      return <MarkdownListItem>{renderChildren()}</MarkdownListItem>

    case 'task_list_item':
      return <MarkdownTaskListItem checked={node.checked}>{renderChildren()}</MarkdownTaskListItem>

    case 'blockquote':
      return <MarkdownBlockquote>{renderChildren()}</MarkdownBlockquote>

    case 'horizontal_rule':
      return <MarkdownHorizontalRule />

    case 'table':
      return <MarkdownTable>{renderChildren()}</MarkdownTable>

    case 'table_head':
      return <MarkdownTableHead>{renderChildren()}</MarkdownTableHead>

    case 'table_body':
      return <MarkdownTableBody>{renderChildren()}</MarkdownTableBody>

    case 'table_row':
      return <MarkdownTableRow>{renderChildren()}</MarkdownTableRow>

    case 'table_cell':
      return <MarkdownTableCell isHeader={node.isHeader}>{renderChildren()}</MarkdownTableCell>

    case 'math_inline':
      return <MarkdownMathInline content={getTextContent(node)} />

    case 'math_block':
      return <MarkdownMathBlock content={getTextContent(node)} />

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

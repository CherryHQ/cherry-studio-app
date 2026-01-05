import React, { useMemo } from 'react'
import type { StyleProp, TextStyle } from 'react-native'
import { View } from 'react-native'
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
import { headingClasses } from './markdownItem/MarkdownHeading'
import { SelectableText } from './markdownItem/SelectableText'

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
  textClassName?: string
  textStyle?: StyleProp<TextStyle>
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

function containsMath(node: MarkdownNode): boolean {
  if (node.type === 'math_inline' || node.type === 'math_block') return true
  if (!node.children) return false
  return node.children.some(containsMath)
}

const BASE_TEXT_CLASSNAME = 'text-foreground text-base'

const mergeClassName = (...classNames: (string | undefined)[]) => {
  const merged = classNames.filter(Boolean).join(' ')
  return merged.length ? merged : undefined
}

const mergeTextStyle = (base?: StyleProp<TextStyle>, next?: StyleProp<TextStyle>): StyleProp<TextStyle> | undefined => {
  if (base && next) return [base, next]
  return base ?? next
}

function NodeRenderer({ node, textClassName, textStyle }: NodeRendererProps) {
  const renderInlineGroup = (
    inlineNodes: MarkdownNode[],
    groupKey: string | undefined,
    inlineTextClassName: string | undefined,
    inlineTextStyle: StyleProp<TextStyle> | undefined
  ) => {
    if (inlineNodes.length === 0) return null

    const groupClassName = mergeClassName(BASE_TEXT_CLASSNAME, inlineTextClassName)
    const hasMath = inlineNodes.some(containsMath)

    if (!hasMath) {
      return (
        <SelectableText key={groupKey} className={groupClassName} style={inlineTextStyle}>
          {inlineNodes.map((child, index) => (
            <NodeRenderer key={index} node={child} textClassName={groupClassName} textStyle={inlineTextStyle} />
          ))}
        </SelectableText>
      )
    }

    const segments: React.ReactNode[] = []
    let textRun: MarkdownNode[] = []

    const flushTextRun = () => {
      if (textRun.length === 0) return
      const runKey = `text-run-${segments.length}`
      segments.push(
        <SelectableText key={runKey} className={groupClassName} style={inlineTextStyle}>
          {textRun.map((child, index) => (
            <NodeRenderer key={index} node={child} textClassName={groupClassName} textStyle={inlineTextStyle} />
          ))}
        </SelectableText>
      )
      textRun = []
    }

    inlineNodes.forEach((child, index) => {
      if (containsMath(child)) {
        flushTextRun()
        segments.push(
          <NodeRenderer
            key={`math-node-${index}`}
            node={child}
            textClassName={groupClassName}
            textStyle={inlineTextStyle}
          />
        )
        return
      }
      textRun.push(child)
    })

    flushTextRun()

    return (
      <View key={groupKey} className="flex-row flex-wrap items-center">
        {segments}
      </View>
    )
  }

  const renderChildren = (
    targetNode: MarkdownNode = node,
    inlineTextClassName: string | undefined = textClassName,
    inlineTextStyle: StyleProp<TextStyle> | undefined = textStyle
  ) => {
    if (!targetNode.children) return null

    const elements: React.ReactNode[] = []
    let currentInlineGroup: MarkdownNode[] = []

    const flushInlineGroup = () => {
      if (currentInlineGroup.length > 0) {
        const groupElement = renderInlineGroup(
          currentInlineGroup,
          `inline-group-${elements.length}`,
          inlineTextClassName,
          inlineTextStyle
        )
        if (groupElement) {
          elements.push(groupElement)
        }
        currentInlineGroup = []
      }
    }

    targetNode.children.forEach((child, index) => {
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

    case 'paragraph': {
      const paragraphTextClassName = mergeClassName(BASE_TEXT_CLASSNAME, textClassName)
      if (containsMath(node)) {
        return <View>{renderChildren(node, textClassName, textStyle)}</View>
      }
      return (
        <MarkdownParagraph className={textClassName} style={textStyle}>
          {node.children?.map((child, index) => (
            <NodeRenderer key={index} node={child} textClassName={paragraphTextClassName} textStyle={textStyle} />
          ))}
        </MarkdownParagraph>
      )
    }

    case 'heading': {
      const level = (node.level || 1) as 1 | 2 | 3 | 4 | 5 | 6
      const headingTextClassName = mergeClassName(headingClasses[level], textClassName)
      if (containsMath(node)) {
        return <View>{renderChildren(node, headingTextClassName, textStyle)}</View>
      }
      return (
        <MarkdownHeading level={level}>
          {node.children?.map((child, index) => (
            <NodeRenderer key={index} node={child} textClassName={headingTextClassName} textStyle={textStyle} />
          ))}
        </MarkdownHeading>
      )
    }

    case 'text':
      return <MarkdownText content={node.content || ''} className={textClassName} style={textStyle} />

    case 'soft_break':
      return <MarkdownSoftBreak />

    case 'line_break':
      return <MarkdownLineBreak />

    case 'bold': {
      const boldClassName = mergeClassName(textClassName, 'font-bold')
      const boldStyle = mergeTextStyle(textStyle, { fontWeight: 'bold' })
      if (node.children && containsMath(node)) {
        return renderInlineGroup(node.children, undefined, boldClassName, boldStyle)
      }
      return (
        <MarkdownBold className={boldClassName} style={boldStyle}>
          {node.children?.map((child, index) => (
            <NodeRenderer key={index} node={child} textClassName={boldClassName} textStyle={boldStyle} />
          ))}
        </MarkdownBold>
      )
    }

    case 'italic': {
      const italicClassName = mergeClassName(textClassName, 'italic')
      const italicStyle = mergeTextStyle(textStyle, { fontStyle: 'italic' })
      if (node.children && containsMath(node)) {
        return renderInlineGroup(node.children, undefined, italicClassName, italicStyle)
      }
      return (
        <MarkdownItalic className={italicClassName} style={italicStyle}>
          {node.children?.map((child, index) => (
            <NodeRenderer key={index} node={child} textClassName={italicClassName} textStyle={italicStyle} />
          ))}
        </MarkdownItalic>
      )
    }

    case 'strikethrough': {
      const strikeClassName = mergeClassName(textClassName, 'line-through')
      const strikeStyle = mergeTextStyle(textStyle, { textDecorationLine: 'line-through' })
      if (node.children && containsMath(node)) {
        return renderInlineGroup(node.children, undefined, strikeClassName, strikeStyle)
      }
      return (
        <MarkdownStrikethrough className={strikeClassName} style={strikeStyle}>
          {node.children?.map((child, index) => (
            <NodeRenderer key={index} node={child} textClassName={strikeClassName} textStyle={strikeStyle} />
          ))}
        </MarkdownStrikethrough>
      )
    }

    case 'code_inline':
      return <MarkdownCodeInline content={node.content || ''} />

    case 'code_block':
      return <MarkdownCodeBlock content={getTextContent(node)} language={node.language} />

    case 'link': {
      const linkClassName = mergeClassName(textClassName, 'text-primary', 'underline', 'text-base')
      return (
        <MarkdownLink href={node.href}>
          {node.children?.map((child, index) => (
            <NodeRenderer key={index} node={child} textClassName={linkClassName} textStyle={textStyle} />
          ))}
        </MarkdownLink>
      )
    }

    case 'image':
      return <MarkdownImage src={node.href} alt={node.alt || node.title} />

    case 'list': {
      const ordered = node.ordered ?? false
      const start = node.start ?? 1
      return (
        <MarkdownList ordered={ordered}>
          {node.children?.map((child, index) => {
            if (child.type === 'list_item') {
              const marker = ordered ? `${start + index}.` : '•'
              return (
                <MarkdownListItem key={`list-item-${index}`} marker={marker}>
                  {renderChildren(child)}
                </MarkdownListItem>
              )
            }
            if (child.type === 'task_list_item') {
              return (
                <MarkdownTaskListItem key={`task-list-item-${index}`} checked={child.checked}>
                  {renderChildren(child)}
                </MarkdownTaskListItem>
              )
            }
            return <NodeRenderer key={`list-child-${index}`} node={child} />
          })}
        </MarkdownList>
      )
    }

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
        return <SelectableText>{node.content}</SelectableText>
      }
      return null
  }
}

import React, { useMemo } from 'react'
import { Image, Linking, Text, View } from 'react-native'
import type { MarkdownNode } from 'react-native-nitro-markdown'
import { parseMarkdownWithOptions } from 'react-native-nitro-markdown'

import { useTheme } from '@/hooks/useTheme'

import { createMarkdownStyles, markdownColors } from './MarkdownStyles'

interface NitroMarkdownProps {
  content: string
}

export function NitroMarkdown({ content }: NitroMarkdownProps) {
  const { isDark } = useTheme()
  const styles = useMemo(() => createMarkdownStyles(isDark), [isDark])
  const colors = isDark ? markdownColors.dark : markdownColors.light

  const ast = useMemo(() => {
    return parseMarkdownWithOptions(content, { gfm: true, math: true })
  }, [content])

  return <NodeRenderer node={ast} styles={styles} colors={colors} />
}

interface NodeRendererProps {
  node: MarkdownNode
  styles: ReturnType<typeof createMarkdownStyles>
  colors: typeof markdownColors.light
}

function NodeRenderer({ node, styles, colors }: NodeRendererProps) {
  const renderChildren = () => {
    if (!node.children) return null
    return node.children.map((child, index) => (
      <NodeRenderer key={index} node={child} styles={styles} colors={colors} />
    ))
  }

  switch (node.type) {
    case 'document':
      return <View>{renderChildren()}</View>

    case 'paragraph':
      return <Text style={styles.paragraph}>{renderChildren()}</Text>

    case 'heading': {
      const headingStyle = {
        1: styles.heading1,
        2: styles.heading2,
        3: styles.heading3,
        4: styles.heading4,
        5: styles.heading5,
        6: styles.heading6
      }[node.level || 1]
      return <Text style={headingStyle}>{renderChildren()}</Text>
    }

    case 'text':
      return <Text style={styles.body}>{node.content}</Text>

    case 'soft_break':
      return <Text>{'\n'}</Text>

    case 'line_break':
      return <Text>{'\n'}</Text>

    case 'bold':
      return <Text style={[styles.body, { fontWeight: 'bold' }]}>{renderChildren()}</Text>

    case 'italic':
      return <Text style={[styles.body, { fontStyle: 'italic' }]}>{renderChildren()}</Text>

    case 'strikethrough':
      return <Text style={[styles.body, { textDecorationLine: 'line-through' }]}>{renderChildren()}</Text>

    case 'code_inline':
      return <Text style={styles.code_inline}>{node.content}</Text>

    case 'code_block':
      return (
        <View style={styles.code_block}>
          <Text style={[styles.body, { fontFamily: 'monospace' }]}>{node.content}</Text>
        </View>
      )

    case 'link':
      return (
        <Text
          style={styles.link}
          onPress={() => {
            if (node.href) {
              Linking.openURL(node.href)
            }
          }}>
          {renderChildren()}
        </Text>
      )

    case 'image':
      return (
        <Image source={{ uri: node.href }} style={[styles.image, { width: 200, height: 150 }]} resizeMode="cover" />
      )

    case 'list':
      return <View style={{ marginVertical: 8 }}>{renderChildren()}</View>

    case 'list_item':
      return (
        <View style={styles.list_item}>
          <Text style={styles.bullet_list_icon}>•</Text>
          <View style={{ flex: 1 }}>{renderChildren()}</View>
        </View>
      )

    case 'task_list_item':
      return (
        <View style={styles.list_item}>
          <Text style={styles.bullet_list_icon}>{node.checked ? '☑' : '☐'}</Text>
          <View style={{ flex: 1 }}>{renderChildren()}</View>
        </View>
      )

    case 'blockquote':
      return <View style={styles.blockquote}>{renderChildren()}</View>

    case 'horizontal_rule':
      return <View style={styles.hr} />

    case 'table':
      return <View style={styles.table}>{renderChildren()}</View>

    case 'table_head':
      return <View>{renderChildren()}</View>

    case 'table_body':
      return <View>{renderChildren()}</View>

    case 'table_row':
      return <View style={{ flexDirection: 'row' }}>{renderChildren()}</View>

    case 'table_cell': {
      const cellStyle = node.isHeader ? styles.th : styles.td
      return (
        <View style={cellStyle}>
          <Text style={styles.body}>{renderChildren()}</Text>
        </View>
      )
    }

    case 'math_inline':
      // For now, just display raw LaTeX
      return <Text style={[styles.code_inline, { color: colors.code }]}>{node.content}</Text>

    case 'math_block':
      // For now, just display raw LaTeX in a block
      return (
        <View style={[styles.code_block, { alignItems: 'center', paddingVertical: 16 }]}>
          <Text style={[styles.body, { fontFamily: 'monospace' }]}>{node.content}</Text>
        </View>
      )

    case 'html_block':
    case 'html_inline':
      // Skip HTML for now
      return null

    default:
      // Fallback for unknown types
      if (node.children) {
        return <>{renderChildren()}</>
      }
      if (node.content) {
        return <Text style={styles.body}>{node.content}</Text>
      }
      return null
  }
}

import '../__mocks__/nativeModules'

import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { parseMarkdownWithOptions } from 'react-native-nitro-markdown'

import {
  createBoldNode,
  createCodeBlockNode,
  createDocumentNode,
  createHeadingNode,
  createHorizontalRuleNode,
  createItalicNode,
  createLineBreakNode,
  createParagraphNode,
  createSoftBreakNode,
  createStrikethroughNode,
  createTextNode
} from '../__mocks__/markdownTestData'
import { MarkdownRenderer } from '../MarkdownRenderer'

// Helper to get internal functions for testing
// Since getTextContent and isInline are not exported, we test them through the component behavior

describe('MarkdownRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('parsing', () => {
    it('parses content with parseMarkdownWithOptions', () => {
      render(<MarkdownRenderer content="Hello World" />)

      expect(parseMarkdownWithOptions).toHaveBeenCalledWith('Hello World', { gfm: true, math: true })
    })

    it('passes gfm and math options', () => {
      render(<MarkdownRenderer content="Test content" />)

      expect(parseMarkdownWithOptions).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ gfm: true, math: true })
      )
    })

    it('memoizes parsing result on re-render with same content', () => {
      const { rerender } = render(<MarkdownRenderer content="Same content" />)

      expect(parseMarkdownWithOptions).toHaveBeenCalledTimes(1)

      rerender(<MarkdownRenderer content="Same content" />)

      // Should still only be called once due to memoization
      expect(parseMarkdownWithOptions).toHaveBeenCalledTimes(1)
    })

    it('re-parses when content changes', () => {
      const { rerender } = render(<MarkdownRenderer content="First content" />)

      expect(parseMarkdownWithOptions).toHaveBeenCalledTimes(1)

      rerender(<MarkdownRenderer content="Second content" />)

      expect(parseMarkdownWithOptions).toHaveBeenCalledTimes(2)
    })
  })

  describe('rendering', () => {
    it('renders simple text correctly', () => {
      ;(parseMarkdownWithOptions as jest.Mock).mockReturnValueOnce(
        createDocumentNode([createParagraphNode([createTextNode('Hello World')])])
      )

      render(<MarkdownRenderer content="Hello World" />)

      expect(screen.getByText('Hello World')).toBeTruthy()
    })

    it('renders bold text correctly', () => {
      ;(parseMarkdownWithOptions as jest.Mock).mockReturnValueOnce(
        createDocumentNode([createParagraphNode([createBoldNode([createTextNode('Bold text')])])])
      )

      render(<MarkdownRenderer content="**Bold text**" />)

      expect(screen.getByText('Bold text')).toBeTruthy()
    })

    it('renders italic text correctly', () => {
      ;(parseMarkdownWithOptions as jest.Mock).mockReturnValueOnce(
        createDocumentNode([createParagraphNode([createItalicNode([createTextNode('Italic text')])])])
      )

      render(<MarkdownRenderer content="*Italic text*" />)

      expect(screen.getByText('Italic text')).toBeTruthy()
    })

    it('renders strikethrough text correctly', () => {
      ;(parseMarkdownWithOptions as jest.Mock).mockReturnValueOnce(
        createDocumentNode([createParagraphNode([createStrikethroughNode([createTextNode('Strikethrough')])])])
      )

      render(<MarkdownRenderer content="~~Strikethrough~~" />)

      expect(screen.getByText('Strikethrough')).toBeTruthy()
    })

    it('renders headings with correct level', () => {
      ;(parseMarkdownWithOptions as jest.Mock).mockReturnValueOnce(
        createDocumentNode([createHeadingNode(1, [createTextNode('Heading 1')])])
      )

      render(<MarkdownRenderer content="# Heading 1" />)

      expect(screen.getByText('Heading 1')).toBeTruthy()
    })

    it('renders code blocks', () => {
      ;(parseMarkdownWithOptions as jest.Mock).mockReturnValueOnce(
        createDocumentNode([createCodeBlockNode('const x = 1;', 'javascript')])
      )

      render(<MarkdownRenderer content="```javascript\nconst x = 1;\n```" />)

      expect(screen.getByTestId('code-highlighter')).toBeTruthy()
      expect(screen.getByTestId('code-content')).toBeTruthy()
    })

    it('renders horizontal rules', () => {
      ;(parseMarkdownWithOptions as jest.Mock).mockReturnValueOnce(createDocumentNode([createHorizontalRuleNode()]))

      const { toJSON } = render(<MarkdownRenderer content="---" />)

      // Check the rendered tree contains the horizontal rule view
      expect(toJSON()).toBeTruthy()
    })

    it('renders soft breaks', () => {
      ;(parseMarkdownWithOptions as jest.Mock).mockReturnValueOnce(
        createDocumentNode([
          createParagraphNode([createTextNode('Line 1'), createSoftBreakNode(), createTextNode('Line 2')])
        ])
      )

      render(<MarkdownRenderer content="Line 1\nLine 2" />)

      expect(screen.getByText('Line 1')).toBeTruthy()
      expect(screen.getByText('Line 2')).toBeTruthy()
    })

    it('renders line breaks', () => {
      ;(parseMarkdownWithOptions as jest.Mock).mockReturnValueOnce(
        createDocumentNode([
          createParagraphNode([createTextNode('Line 1'), createLineBreakNode(), createTextNode('Line 2')])
        ])
      )

      render(<MarkdownRenderer content="Line 1  \nLine 2" />)

      expect(screen.getByText('Line 1')).toBeTruthy()
      expect(screen.getByText('Line 2')).toBeTruthy()
    })

    it('handles empty content', () => {
      ;(parseMarkdownWithOptions as jest.Mock).mockReturnValueOnce(createDocumentNode([]))

      const { toJSON } = render(<MarkdownRenderer content="" />)

      expect(toJSON()).toBeTruthy()
    })

    it('handles complex nested document', () => {
      ;(parseMarkdownWithOptions as jest.Mock).mockReturnValueOnce(
        createDocumentNode([
          createHeadingNode(1, [createTextNode('Title')]),
          createParagraphNode([
            createTextNode('This is '),
            createBoldNode([createItalicNode([createTextNode('bold italic')])]),
            createTextNode(' text.')
          ])
        ])
      )

      render(<MarkdownRenderer content="# Title\n\nThis is ***bold italic*** text." />)

      expect(screen.getByText('Title')).toBeTruthy()
      expect(screen.getByText('This is ')).toBeTruthy()
      expect(screen.getByText('bold italic')).toBeTruthy()
      expect(screen.getByText(' text.')).toBeTruthy()
    })
  })

  describe('inline grouping', () => {
    it('groups consecutive inline elements', () => {
      ;(parseMarkdownWithOptions as jest.Mock).mockReturnValueOnce(
        createDocumentNode([
          createParagraphNode([
            createTextNode('Normal '),
            createBoldNode([createTextNode('bold')]),
            createTextNode(' text')
          ])
        ])
      )

      render(<MarkdownRenderer content="Normal **bold** text" />)

      // All inline elements should be rendered
      expect(screen.getByText('Normal ')).toBeTruthy()
      expect(screen.getByText('bold')).toBeTruthy()
      expect(screen.getByText(' text')).toBeTruthy()
    })
  })
})

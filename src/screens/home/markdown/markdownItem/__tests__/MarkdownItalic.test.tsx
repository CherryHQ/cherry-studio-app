import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { MarkdownItalic } from '../MarkdownItalic'

describe('MarkdownItalic', () => {
  it('renders children correctly', () => {
    render(<MarkdownItalic>Italic text</MarkdownItalic>)

    expect(screen.getByText('Italic text')).toBeTruthy()
  })

  it('applies italic class', () => {
    const { toJSON } = render(<MarkdownItalic>Italic text</MarkdownItalic>)

    const tree = toJSON()
    expect(tree).toBeTruthy()
    expect((tree as { props?: { className?: string } })?.props?.className).toContain('italic')
  })

  it('applies text-foreground class', () => {
    const { toJSON } = render(<MarkdownItalic>Italic text</MarkdownItalic>)

    const tree = toJSON()
    expect((tree as { props?: { className?: string } })?.props?.className).toContain('text-foreground')
  })

  it('renders nested content correctly', () => {
    render(
      <MarkdownItalic>
        <Text>Nested</Text>
        <Text>Content</Text>
      </MarkdownItalic>
    )

    expect(screen.getByText('Nested')).toBeTruthy()
    expect(screen.getByText('Content')).toBeTruthy()
  })

  it('renders without children gracefully', () => {
    const { toJSON } = render(<MarkdownItalic>{null}</MarkdownItalic>)

    expect(toJSON()).toBeTruthy()
  })
})

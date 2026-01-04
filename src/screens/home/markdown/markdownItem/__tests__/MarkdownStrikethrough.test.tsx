import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { MarkdownStrikethrough } from '../MarkdownStrikethrough'

describe('MarkdownStrikethrough', () => {
  it('renders children correctly', () => {
    render(<MarkdownStrikethrough>Strikethrough text</MarkdownStrikethrough>)

    expect(screen.getByText('Strikethrough text')).toBeTruthy()
  })

  it('applies line-through class', () => {
    const { toJSON } = render(<MarkdownStrikethrough>Strikethrough text</MarkdownStrikethrough>)

    const tree = toJSON()
    expect(tree).toBeTruthy()
    expect((tree as { props?: { className?: string } })?.props?.className).toContain('line-through')
  })

  it('applies text-foreground class', () => {
    const { toJSON } = render(<MarkdownStrikethrough>Strikethrough text</MarkdownStrikethrough>)

    const tree = toJSON()
    expect((tree as { props?: { className?: string } })?.props?.className).toContain('text-foreground')
  })

  it('renders nested content correctly', () => {
    render(
      <MarkdownStrikethrough>
        <Text>Nested</Text>
        <Text>Content</Text>
      </MarkdownStrikethrough>
    )

    expect(screen.getByText('Nested')).toBeTruthy()
    expect(screen.getByText('Content')).toBeTruthy()
  })

  it('renders without children gracefully', () => {
    const { toJSON } = render(<MarkdownStrikethrough>{null}</MarkdownStrikethrough>)

    expect(toJSON()).toBeTruthy()
  })
})

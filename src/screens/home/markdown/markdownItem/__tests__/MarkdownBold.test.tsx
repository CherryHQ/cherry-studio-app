import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { MarkdownBold } from '../MarkdownBold'

describe('MarkdownBold', () => {
  it('renders children correctly', () => {
    render(<MarkdownBold>Bold text</MarkdownBold>)

    expect(screen.getByText('Bold text')).toBeTruthy()
  })

  it('applies font-bold class', () => {
    const { toJSON } = render(<MarkdownBold>Bold text</MarkdownBold>)

    const tree = toJSON()
    expect(tree).toBeTruthy()
    // The component should have className containing 'font-bold'
    expect((tree as { props?: { className?: string } })?.props?.className).toContain('font-bold')
  })

  it('applies text-foreground class', () => {
    const { toJSON } = render(<MarkdownBold>Bold text</MarkdownBold>)

    const tree = toJSON()
    expect((tree as { props?: { className?: string } })?.props?.className).toContain('text-foreground')
  })

  it('renders nested content correctly', () => {
    render(
      <MarkdownBold>
        <Text>Nested</Text>
        <Text>Content</Text>
      </MarkdownBold>
    )

    expect(screen.getByText('Nested')).toBeTruthy()
    expect(screen.getByText('Content')).toBeTruthy()
  })

  it('renders without children gracefully', () => {
    const { toJSON } = render(<MarkdownBold>{null}</MarkdownBold>)

    expect(toJSON()).toBeTruthy()
  })

  it('handles empty string children', () => {
    const { toJSON } = render(<MarkdownBold>{''}</MarkdownBold>)

    expect(toJSON()).toBeTruthy()
  })
})

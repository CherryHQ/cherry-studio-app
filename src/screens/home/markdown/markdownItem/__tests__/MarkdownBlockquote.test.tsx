import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { MarkdownBlockquote } from '../MarkdownBlockquote'

describe('MarkdownBlockquote', () => {
  it('renders children correctly', () => {
    render(
      <MarkdownBlockquote>
        <Text>Quote text</Text>
      </MarkdownBlockquote>
    )

    expect(screen.getByText('Quote text')).toBeTruthy()
  })

  it('applies border-l-4 class for left border', () => {
    const { toJSON } = render(
      <MarkdownBlockquote>
        <Text>Quote</Text>
      </MarkdownBlockquote>
    )

    const tree = toJSON()
    const className = (tree as { props?: { className?: string } })?.props?.className
    expect(className).toContain('border-l-4')
  })

  it('applies border-muted class for border color', () => {
    const { toJSON } = render(
      <MarkdownBlockquote>
        <Text>Quote</Text>
      </MarkdownBlockquote>
    )

    const tree = toJSON()
    const className = (tree as { props?: { className?: string } })?.props?.className
    expect(className).toContain('border-muted')
  })

  it('applies pl-4 class for left padding', () => {
    const { toJSON } = render(
      <MarkdownBlockquote>
        <Text>Quote</Text>
      </MarkdownBlockquote>
    )

    const tree = toJSON()
    const className = (tree as { props?: { className?: string } })?.props?.className
    expect(className).toContain('pl-4')
  })

  it('handles nested blockquotes', () => {
    render(
      <MarkdownBlockquote>
        <MarkdownBlockquote>
          <Text>Nested quote</Text>
        </MarkdownBlockquote>
      </MarkdownBlockquote>
    )

    expect(screen.getByText('Nested quote')).toBeTruthy()
  })

  it('handles multiple children', () => {
    render(
      <MarkdownBlockquote>
        <Text>Line 1</Text>
        <Text>Line 2</Text>
      </MarkdownBlockquote>
    )

    expect(screen.getByText('Line 1')).toBeTruthy()
    expect(screen.getByText('Line 2')).toBeTruthy()
  })

  it('handles empty children', () => {
    const { toJSON } = render(<MarkdownBlockquote>{null}</MarkdownBlockquote>)

    expect(toJSON()).toBeTruthy()
  })
})

import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { MarkdownParagraph } from '../MarkdownParagraph'

describe('MarkdownParagraph', () => {
  it('renders children correctly', () => {
    render(<MarkdownParagraph>Paragraph text</MarkdownParagraph>)

    expect(screen.getByText('Paragraph text')).toBeTruthy()
  })

  it('applies text-base class', () => {
    const { toJSON } = render(<MarkdownParagraph>Paragraph text</MarkdownParagraph>)

    const tree = toJSON()
    expect(tree).toBeTruthy()
    expect((tree as { props?: { className?: string } })?.props?.className).toContain('text-base')
  })

  it('applies text-foreground class', () => {
    const { toJSON } = render(<MarkdownParagraph>Paragraph text</MarkdownParagraph>)

    const tree = toJSON()
    expect((tree as { props?: { className?: string } })?.props?.className).toContain('text-foreground')
  })

  it('renders multiple children correctly', () => {
    render(
      <MarkdownParagraph>
        <Text>First</Text>
        <Text>Second</Text>
        <Text>Third</Text>
      </MarkdownParagraph>
    )

    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
    expect(screen.getByText('Third')).toBeTruthy()
  })

  it('handles empty children', () => {
    const { toJSON } = render(<MarkdownParagraph>{null}</MarkdownParagraph>)

    expect(toJSON()).toBeTruthy()
  })
})

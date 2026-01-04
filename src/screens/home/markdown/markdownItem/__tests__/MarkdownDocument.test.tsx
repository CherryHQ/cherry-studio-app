import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { MarkdownDocument } from '../MarkdownDocument'

describe('MarkdownDocument', () => {
  it('renders children in a View container', () => {
    render(
      <MarkdownDocument>
        <Text>Content</Text>
      </MarkdownDocument>
    )

    expect(screen.getByText('Content')).toBeTruthy()
  })

  it('handles empty children', () => {
    const { toJSON } = render(<MarkdownDocument>{null}</MarkdownDocument>)

    expect(toJSON()).toBeTruthy()
  })

  it('renders multiple children correctly', () => {
    render(
      <MarkdownDocument>
        <Text>First</Text>
        <Text>Second</Text>
        <Text>Third</Text>
      </MarkdownDocument>
    )

    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
    expect(screen.getByText('Third')).toBeTruthy()
  })

  it('renders nested components correctly', () => {
    render(
      <MarkdownDocument>
        <MarkdownDocument>
          <Text>Nested content</Text>
        </MarkdownDocument>
      </MarkdownDocument>
    )

    expect(screen.getByText('Nested content')).toBeTruthy()
  })
})

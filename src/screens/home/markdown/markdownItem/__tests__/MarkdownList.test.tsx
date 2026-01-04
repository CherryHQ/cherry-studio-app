import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { MarkdownList } from '../MarkdownList'

describe('MarkdownList', () => {
  it('renders children correctly', () => {
    render(
      <MarkdownList>
        <Text>Item 1</Text>
        <Text>Item 2</Text>
      </MarkdownList>
    )

    expect(screen.getByText('Item 1')).toBeTruthy()
    expect(screen.getByText('Item 2')).toBeTruthy()
  })

  it('renders ordered list correctly', () => {
    const { toJSON } = render(
      <MarkdownList ordered>
        <Text>Item</Text>
      </MarkdownList>
    )

    expect(toJSON()).toBeTruthy()
  })

  it('renders unordered list correctly', () => {
    const { toJSON } = render(
      <MarkdownList ordered={false}>
        <Text>Item</Text>
      </MarkdownList>
    )

    expect(toJSON()).toBeTruthy()
  })

  it('applies my-2 margin styling', () => {
    const { toJSON } = render(
      <MarkdownList>
        <Text>Item</Text>
      </MarkdownList>
    )

    const tree = toJSON()
    const className = (tree as { props?: { className?: string } })?.props?.className
    expect(className).toContain('my-2')
  })

  it('handles empty list', () => {
    const { toJSON } = render(<MarkdownList>{null}</MarkdownList>)

    expect(toJSON()).toBeTruthy()
  })

  it('handles nested lists', () => {
    render(
      <MarkdownList>
        <MarkdownList>
          <Text>Nested Item</Text>
        </MarkdownList>
      </MarkdownList>
    )

    expect(screen.getByText('Nested Item')).toBeTruthy()
  })

  it('renders without ordered prop (defaults to undefined)', () => {
    const { toJSON } = render(
      <MarkdownList>
        <Text>Item</Text>
      </MarkdownList>
    )

    expect(toJSON()).toBeTruthy()
  })
})

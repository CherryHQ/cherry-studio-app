import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { MarkdownListItem } from '../MarkdownListItem'

describe('MarkdownListItem', () => {
  it('renders bullet point marker', () => {
    render(
      <MarkdownListItem>
        <Text>Item content</Text>
      </MarkdownListItem>
    )

    expect(screen.getByText('•')).toBeTruthy()
  })

  it('renders custom marker', () => {
    render(
      <MarkdownListItem marker="2.">
        <Text>Item content</Text>
      </MarkdownListItem>
    )

    expect(screen.getByText('2.')).toBeTruthy()
  })

  it('renders children in flex container', () => {
    render(
      <MarkdownListItem>
        <Text>Item content</Text>
      </MarkdownListItem>
    )

    expect(screen.getByText('Item content')).toBeTruthy()
  })

  it('applies flex-row layout', () => {
    const { toJSON } = render(
      <MarkdownListItem>
        <Text>Item</Text>
      </MarkdownListItem>
    )

    const tree = toJSON()
    const className = (tree as { props?: { className?: string } })?.props?.className
    expect(className).toContain('flex-row')
  })

  it('handles complex children content', () => {
    render(
      <MarkdownListItem>
        <Text>First</Text>
        <Text>Second</Text>
        <Text>Third</Text>
      </MarkdownListItem>
    )

    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
    expect(screen.getByText('Third')).toBeTruthy()
  })

  it('applies text-foreground to bullet', () => {
    const { toJSON } = render(
      <MarkdownListItem>
        <Text>Item</Text>
      </MarkdownListItem>
    )

    const tree = toJSON()
    // The bullet text should have text-foreground class
    const children = (tree as { children?: { props?: { className?: string } }[] })?.children
    const bulletText = children?.[0]
    expect(bulletText?.props?.className).toContain('text-foreground')
  })

  it('applies text-base to bullet', () => {
    const { toJSON } = render(
      <MarkdownListItem>
        <Text>Item</Text>
      </MarkdownListItem>
    )

    const tree = toJSON()
    const children = (tree as { children?: { props?: { className?: string } }[] })?.children
    const bulletText = children?.[0]
    expect(bulletText?.props?.className).toContain('text-base')
  })

  it('applies mr-2 to bullet for spacing', () => {
    const { toJSON } = render(
      <MarkdownListItem>
        <Text>Item</Text>
      </MarkdownListItem>
    )

    const tree = toJSON()
    const children = (tree as { children?: { props?: { className?: string } }[] })?.children
    const bulletText = children?.[0]
    expect(bulletText?.props?.className).toContain('mr-2')
  })

  it('applies flex-1 to content container', () => {
    const { toJSON } = render(
      <MarkdownListItem>
        <Text>Item</Text>
      </MarkdownListItem>
    )

    const tree = toJSON()
    const children = (tree as { children?: { props?: { className?: string } }[] })?.children
    const contentContainer = children?.[1]
    expect(contentContainer?.props?.className).toContain('flex-1')
  })

  it('handles empty children', () => {
    const { toJSON } = render(<MarkdownListItem>{null}</MarkdownListItem>)

    expect(toJSON()).toBeTruthy()
    // Bullet should still be present
    expect(screen.getByText('•')).toBeTruthy()
  })
})

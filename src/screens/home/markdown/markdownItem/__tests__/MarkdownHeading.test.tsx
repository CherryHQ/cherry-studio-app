import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { MarkdownHeading } from '../MarkdownHeading'

describe('MarkdownHeading', () => {
  describe('level 1', () => {
    it('renders with text-3xl font-bold styling', () => {
      const { toJSON } = render(<MarkdownHeading level={1}>Heading 1</MarkdownHeading>)

      const tree = toJSON()
      expect(tree).toBeTruthy()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('text-3xl')
      expect(className).toContain('font-bold')
    })

    it('renders children content correctly', () => {
      render(<MarkdownHeading level={1}>Heading 1 Content</MarkdownHeading>)

      expect(screen.getByText('Heading 1 Content')).toBeTruthy()
    })
  })

  describe('level 2', () => {
    it('renders with text-2xl font-bold styling', () => {
      const { toJSON } = render(<MarkdownHeading level={2}>Heading 2</MarkdownHeading>)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('text-2xl')
      expect(className).toContain('font-bold')
    })
  })

  describe('level 3', () => {
    it('renders with text-xl font-bold styling', () => {
      const { toJSON } = render(<MarkdownHeading level={3}>Heading 3</MarkdownHeading>)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('text-xl')
      expect(className).toContain('font-bold')
    })
  })

  describe('level 4', () => {
    it('renders with text-lg font-bold styling', () => {
      const { toJSON } = render(<MarkdownHeading level={4}>Heading 4</MarkdownHeading>)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('text-lg')
      expect(className).toContain('font-bold')
    })
  })

  describe('level 5', () => {
    it('renders with text-base font-bold styling', () => {
      const { toJSON } = render(<MarkdownHeading level={5}>Heading 5</MarkdownHeading>)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('text-base')
      expect(className).toContain('font-bold')
    })
  })

  describe('level 6', () => {
    it('renders with text-base font-bold styling', () => {
      const { toJSON } = render(<MarkdownHeading level={6}>Heading 6</MarkdownHeading>)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('text-base')
      expect(className).toContain('font-bold')
    })
  })

  it('applies text-foreground class for all levels', () => {
    const levels: Array<1 | 2 | 3 | 4 | 5 | 6> = [1, 2, 3, 4, 5, 6]

    levels.forEach(level => {
      const { toJSON } = render(<MarkdownHeading level={level}>Heading</MarkdownHeading>)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('text-foreground')
    })
  })

  it('handles nested inline elements', () => {
    render(
      <MarkdownHeading level={1}>
        <Text>Nested</Text>
        <Text>Content</Text>
      </MarkdownHeading>
    )

    expect(screen.getByText('Nested')).toBeTruthy()
    expect(screen.getByText('Content')).toBeTruthy()
  })

  it('handles empty children', () => {
    const { toJSON } = render(<MarkdownHeading level={1}>{null}</MarkdownHeading>)

    expect(toJSON()).toBeTruthy()
  })
})

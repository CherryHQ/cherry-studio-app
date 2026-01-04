import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { MarkdownCodeInline } from '../MarkdownCodeInline'

describe('MarkdownCodeInline', () => {
  it('renders code content correctly', () => {
    render(<MarkdownCodeInline content="const x = 1" />)

    expect(screen.getByText('const x = 1')).toBeTruthy()
  })

  it('applies FiraCode font family', () => {
    const { toJSON } = render(<MarkdownCodeInline content="code" />)

    const tree = toJSON()
    expect(tree).toBeTruthy()
    const style = (tree as { props?: { style?: { fontFamily?: string } } })?.props?.style
    expect(style?.fontFamily).toBe('FiraCode')
  })

  it('applies text-amber-500 color class', () => {
    const { toJSON } = render(<MarkdownCodeInline content="code" />)

    const tree = toJSON()
    const className = (tree as { props?: { className?: string } })?.props?.className
    expect(className).toContain('text-amber-500')
  })

  it('applies background styling', () => {
    const { toJSON } = render(<MarkdownCodeInline content="code" />)

    const tree = toJSON()
    const className = (tree as { props?: { className?: string } })?.props?.className
    expect(className).toContain('bg-neutral-200/40')
  })

  it('applies dark mode background styling', () => {
    const { toJSON } = render(<MarkdownCodeInline content="code" />)

    const tree = toJSON()
    const className = (tree as { props?: { className?: string } })?.props?.className
    expect(className).toContain('dark:bg-neutral-800')
  })

  it('applies text-md class', () => {
    const { toJSON } = render(<MarkdownCodeInline content="code" />)

    const tree = toJSON()
    const className = (tree as { props?: { className?: string } })?.props?.className
    expect(className).toContain('text-md')
  })

  it('handles empty content', () => {
    const { toJSON } = render(<MarkdownCodeInline content="" />)

    expect(toJSON()).toBeTruthy()
  })

  it('handles special code characters', () => {
    const specialCode = '<div>test</div>'
    render(<MarkdownCodeInline content={specialCode} />)

    expect(screen.getByText(specialCode)).toBeTruthy()
  })

  it('handles backticks in content', () => {
    render(<MarkdownCodeInline content="`nested`" />)

    expect(screen.getByText('`nested`')).toBeTruthy()
  })

  it('handles long code content', () => {
    const longCode = 'x'.repeat(100)
    render(<MarkdownCodeInline content={longCode} />)

    expect(screen.getByText(longCode)).toBeTruthy()
  })
})

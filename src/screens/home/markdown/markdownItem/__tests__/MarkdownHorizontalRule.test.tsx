import { render } from '@testing-library/react-native'
import React from 'react'

import { MarkdownHorizontalRule } from '../MarkdownHorizontalRule'

describe('MarkdownHorizontalRule', () => {
  it('renders horizontal divider', () => {
    const { toJSON } = render(<MarkdownHorizontalRule />)

    expect(toJSON()).toBeTruthy()
  })

  it('applies my-4 class for vertical margin', () => {
    const { toJSON } = render(<MarkdownHorizontalRule />)

    const tree = toJSON()
    expect(tree).toBeTruthy()
    expect((tree as { props?: { className?: string } })?.props?.className).toContain('my-4')
  })

  it('applies h-px class for height', () => {
    const { toJSON } = render(<MarkdownHorizontalRule />)

    const tree = toJSON()
    expect((tree as { props?: { className?: string } })?.props?.className).toContain('h-px')
  })

  it('applies bg-zinc-600 class for color', () => {
    const { toJSON } = render(<MarkdownHorizontalRule />)

    const tree = toJSON()
    expect((tree as { props?: { className?: string } })?.props?.className).toContain('bg-zinc-600')
  })

  it('is a self-contained component without props', () => {
    // Component should render without any props
    const { toJSON } = render(<MarkdownHorizontalRule />)

    expect(toJSON()).toBeTruthy()
  })
})

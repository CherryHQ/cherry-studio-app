import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { MarkdownSoftBreak } from '../MarkdownSoftBreak'

describe('MarkdownSoftBreak', () => {
  it('renders newline character', () => {
    render(<MarkdownSoftBreak />)

    expect(screen.getByText('\n')).toBeTruthy()
  })

  it('is a self-contained component without props', () => {
    const { toJSON } = render(<MarkdownSoftBreak />)

    expect(toJSON()).toBeTruthy()
  })

  it('renders as Text component', () => {
    const { toJSON } = render(<MarkdownSoftBreak />)

    const tree = toJSON()
    expect(tree).toBeTruthy()
    expect((tree as { type?: string })?.type).toBe('Text')
  })
})

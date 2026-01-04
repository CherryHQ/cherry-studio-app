import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { MarkdownLineBreak } from '../MarkdownLineBreak'

describe('MarkdownLineBreak', () => {
  it('renders newline character', () => {
    render(<MarkdownLineBreak />)

    expect(screen.getByText('\n')).toBeTruthy()
  })

  it('is a self-contained component without props', () => {
    const { toJSON } = render(<MarkdownLineBreak />)

    expect(toJSON()).toBeTruthy()
  })

  it('renders as Text component', () => {
    const { toJSON } = render(<MarkdownLineBreak />)

    const tree = toJSON()
    expect(tree).toBeTruthy()
    expect((tree as { type?: string })?.type).toBe('Text')
  })
})

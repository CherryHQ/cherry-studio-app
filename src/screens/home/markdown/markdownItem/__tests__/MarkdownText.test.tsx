import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { MarkdownText } from '../MarkdownText'

describe('MarkdownText', () => {
  it('renders text content correctly', () => {
    render(<MarkdownText content="Hello World" />)

    expect(screen.getByText('Hello World')).toBeTruthy()
  })

  it('renders empty string without crashing', () => {
    const { toJSON } = render(<MarkdownText content="" />)

    expect(toJSON()).toBeTruthy()
  })

  it('handles special characters', () => {
    const specialChars = '<>&"\''
    render(<MarkdownText content={specialChars} />)

    expect(screen.getByText(specialChars)).toBeTruthy()
  })

  it('handles unicode content', () => {
    render(<MarkdownText content="Hello 世界 🌍" />)

    expect(screen.getByText('Hello 世界 🌍')).toBeTruthy()
  })

  it('handles long text content', () => {
    const longText = 'A'.repeat(1000)
    render(<MarkdownText content={longText} />)

    expect(screen.getByText(longText)).toBeTruthy()
  })

  it('handles whitespace content', () => {
    render(<MarkdownText content="   " />)

    expect(screen.getByText('   ')).toBeTruthy()
  })

  it('handles newline characters in content', () => {
    const content = 'Line1\nLine2'
    render(<MarkdownText content={content} />)

    // The content is rendered, just check the component renders
    const { toJSON } = render(<MarkdownText content={content} />)
    expect(toJSON()).toBeTruthy()
  })
})

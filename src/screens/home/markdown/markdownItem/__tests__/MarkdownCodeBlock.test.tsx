import '../../__mocks__/nativeModules'

import { fireEvent, render, screen } from '@testing-library/react-native'
import * as Clipboard from 'expo-clipboard'
import React from 'react'

import { MarkdownCodeBlock } from '../MarkdownCodeBlock'

// Get mocked functions
const mockNavigate = jest.fn()
const mockDispatch = jest.fn()

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate
  })
}))

jest.mock('@/store', () => ({
  useAppDispatch: () => mockDispatch
}))

describe('MarkdownCodeBlock', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders code content', () => {
      render(<MarkdownCodeBlock content="const x = 1;" language="javascript" />)

      expect(screen.getByTestId('code-highlighter')).toBeTruthy()
      expect(screen.getByText('const x = 1;')).toBeTruthy()
    })

    it('displays language label in uppercase', () => {
      render(<MarkdownCodeBlock content="code" language="javascript" />)

      expect(screen.getByText('JAVASCRIPT')).toBeTruthy()
    })

    it('uses CodeHighlighter component', () => {
      render(<MarkdownCodeBlock content="code" language="javascript" />)

      expect(screen.getByTestId('code-highlighter')).toBeTruthy()
    })

    it('defaults language to "text" when undefined', () => {
      render(<MarkdownCodeBlock content="code" />)

      expect(screen.getByText('TEXT')).toBeTruthy()
    })

    it('defaults language to "text" when empty', () => {
      render(<MarkdownCodeBlock content="code" language="" />)

      expect(screen.getByText('TEXT')).toBeTruthy()
    })
  })

  describe('copy functionality', () => {
    it('renders copy button', () => {
      render(<MarkdownCodeBlock content="code" language="javascript" />)

      expect(screen.getByTestId('icon-copy')).toBeTruthy()
    })

    it('calls Clipboard.setStringAsync on copy press', () => {
      render(<MarkdownCodeBlock content="const x = 1;" language="javascript" />)

      const copyButton = screen.getAllByTestId('icon-button')[0]
      fireEvent.press(copyButton)

      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('const x = 1;')
    })

    it('copies exact content to clipboard', () => {
      const content = 'function test() {\n  return true;\n}'
      render(<MarkdownCodeBlock content={content} language="javascript" />)

      const copyButton = screen.getAllByTestId('icon-button')[0]
      fireEvent.press(copyButton)

      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(content)
    })
  })

  describe('HTML preview functionality', () => {
    it('shows preview button only for HTML language', () => {
      render(<MarkdownCodeBlock content="<div>test</div>" language="html" />)

      expect(screen.getByTestId('icon-eye')).toBeTruthy()
    })

    it('does not show preview button for other languages', () => {
      render(<MarkdownCodeBlock content="code" language="javascript" />)

      expect(screen.queryByTestId('icon-eye')).toBeNull()
    })

    it('handles case-insensitive HTML language detection', () => {
      render(<MarkdownCodeBlock content="<div>test</div>" language="HTML" />)

      expect(screen.getByTestId('icon-eye')).toBeTruthy()
    })

    it('has preview button that can be pressed', () => {
      render(<MarkdownCodeBlock content="<div>test</div>" language="html" />)

      // Find the preview button (first icon-button for HTML)
      const previewButton = screen.getAllByTestId('icon-button')[0]

      // Verify the button exists and can be pressed without error
      expect(previewButton).toBeTruthy()
      fireEvent.press(previewButton)
    })
  })

  describe('edge cases', () => {
    it('handles empty content', () => {
      const { toJSON } = render(<MarkdownCodeBlock content="" language="javascript" />)

      expect(toJSON()).toBeTruthy()
    })

    it('handles very long code content', () => {
      const longCode = 'x'.repeat(10000)
      const { toJSON } = render(<MarkdownCodeBlock content={longCode} language="javascript" />)

      expect(toJSON()).toBeTruthy()
    })

    it('handles special characters in code', () => {
      const specialChars = '<>&"\''
      render(<MarkdownCodeBlock content={specialChars} language="javascript" />)

      expect(screen.getByText(specialChars)).toBeTruthy()
    })

    it('handles multi-line code', () => {
      const multiLineCode = 'line1\nline2\nline3'
      render(<MarkdownCodeBlock content={multiLineCode} language="javascript" />)

      expect(screen.getByText(multiLineCode)).toBeTruthy()
    })
  })
})

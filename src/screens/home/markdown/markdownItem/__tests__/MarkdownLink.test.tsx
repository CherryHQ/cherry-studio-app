import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Linking, Text } from 'react-native'

import { MarkdownLink } from '../MarkdownLink'

// Spy on Linking.openURL
const mockOpenURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
const mockCanOpenURL = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true)
const flushPromises = () => new Promise(setImmediate)

describe('MarkdownLink', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders children as link text', () => {
      render(<MarkdownLink href="https://example.com">Link Text</MarkdownLink>)

      expect(screen.getByText('Link Text')).toBeTruthy()
    })

    it('applies text-primary class', () => {
      const { toJSON } = render(<MarkdownLink href="https://example.com">Link</MarkdownLink>)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('text-primary')
    })

    it('applies underline class', () => {
      const { toJSON } = render(<MarkdownLink href="https://example.com">Link</MarkdownLink>)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('underline')
    })

    it('applies text-base class', () => {
      const { toJSON } = render(<MarkdownLink href="https://example.com">Link</MarkdownLink>)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('text-base')
    })

    it('handles nested children elements', () => {
      render(
        <MarkdownLink href="https://example.com">
          <Text>Nested</Text>
          <Text>Content</Text>
        </MarkdownLink>
      )

      expect(screen.getByText('Nested')).toBeTruthy()
      expect(screen.getByText('Content')).toBeTruthy()
    })
  })

  describe('press handling', () => {
    it('calls Linking.openURL with href on press', async () => {
      render(<MarkdownLink href="https://example.com">Link</MarkdownLink>)

      fireEvent.press(screen.getByText('Link'))
      await flushPromises()

      expect(mockOpenURL).toHaveBeenCalledWith('https://example.com')
    })

    it('does not call openURL when href is undefined', async () => {
      render(<MarkdownLink href={undefined}>Link</MarkdownLink>)

      fireEvent.press(screen.getByText('Link'))
      await flushPromises()

      expect(mockOpenURL).not.toHaveBeenCalled()
    })

    it('does not call openURL when href is empty string', async () => {
      render(<MarkdownLink href="">Link</MarkdownLink>)

      fireEvent.press(screen.getByText('Link'))
      await flushPromises()

      expect(mockOpenURL).not.toHaveBeenCalled()
    })

    it('does not call openURL when canOpenURL is false', async () => {
      mockCanOpenURL.mockResolvedValueOnce(false)
      render(<MarkdownLink href="https://example.com">Link</MarkdownLink>)

      fireEvent.press(screen.getByText('Link'))
      await flushPromises()

      expect(mockOpenURL).not.toHaveBeenCalled()
    })
  })

  describe('href validation', () => {
    it('handles http URLs', async () => {
      render(<MarkdownLink href="http://example.com">Link</MarkdownLink>)

      fireEvent.press(screen.getByText('Link'))
      await flushPromises()

      expect(mockOpenURL).toHaveBeenCalledWith('http://example.com')
    })

    it('handles https URLs', async () => {
      render(<MarkdownLink href="https://example.com">Link</MarkdownLink>)

      fireEvent.press(screen.getByText('Link'))
      await flushPromises()

      expect(mockOpenURL).toHaveBeenCalledWith('https://example.com')
    })

    it('handles mailto URLs', async () => {
      render(<MarkdownLink href="mailto:test@example.com">Email</MarkdownLink>)

      fireEvent.press(screen.getByText('Email'))
      await flushPromises()

      expect(mockOpenURL).toHaveBeenCalledWith('mailto:test@example.com')
    })

    it('handles tel URLs', async () => {
      render(<MarkdownLink href="tel:+1234567890">Phone</MarkdownLink>)

      fireEvent.press(screen.getByText('Phone'))
      await flushPromises()

      expect(mockOpenURL).toHaveBeenCalledWith('tel:+1234567890')
    })

    it('handles relative URLs', async () => {
      render(<MarkdownLink href="/path/to/page">Page</MarkdownLink>)

      fireEvent.press(screen.getByText('Page'))
      await flushPromises()

      expect(mockOpenURL).toHaveBeenCalledWith('/path/to/page')
    })

    it('handles anchor links', async () => {
      render(<MarkdownLink href="#section">Section</MarkdownLink>)

      fireEvent.press(screen.getByText('Section'))
      await flushPromises()

      expect(mockOpenURL).toHaveBeenCalledWith('#section')
    })
  })

  describe('accessibility', () => {
    it('is pressable/tappable', async () => {
      render(<MarkdownLink href="https://example.com">Accessible Link</MarkdownLink>)

      const link = screen.getByText('Accessible Link')
      expect(link).toBeTruthy()

      // Verify onPress is set
      fireEvent.press(link)
      await flushPromises()
      expect(mockOpenURL).toHaveBeenCalled()
    })

    it('renders as Text component', () => {
      const { toJSON } = render(<MarkdownLink href="https://example.com">Link</MarkdownLink>)

      const tree = toJSON()
      expect((tree as { type?: string })?.type).toBe('Text')
    })
  })
})

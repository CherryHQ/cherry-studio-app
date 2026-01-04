import '../../__mocks__/nativeModules'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

import { MarkdownImage } from '../MarkdownImage'

describe('MarkdownImage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders image from src', () => {
      render(<MarkdownImage src="https://example.com/image.png" />)

      expect(screen.getByTestId('image')).toBeTruthy()
    })

    it('returns null when src is undefined', () => {
      const { toJSON } = render(<MarkdownImage src={undefined} />)

      expect(toJSON()).toBeNull()
    })

    it('returns null when src is empty string', () => {
      const { toJSON } = render(<MarkdownImage src="" />)

      expect(toJSON()).toBeNull()
    })

    it('sets accessibilityLabel from alt prop', () => {
      render(<MarkdownImage src="https://example.com/image.png" alt="Test image description" />)

      const image = screen.getByTestId('image')
      expect(image.props.accessibilityLabel).toBe('Test image description')
    })
  })

  describe('error handling', () => {
    it('shows ImageOff icon when image fails to load', async () => {
      render(<MarkdownImage src="https://example.com/invalid.png" />)

      const image = screen.getByTestId('image')

      // Simulate image load error
      fireEvent(image, 'error')

      await waitFor(() => {
        expect(screen.getByTestId('icon-image-off')).toBeTruthy()
      })
    })
  })

  describe('gallery viewer', () => {
    it('opens ImageGalleryViewer on image press', async () => {
      render(<MarkdownImage src="https://example.com/image.png" />)

      const image = screen.getByTestId('image')
      fireEvent.press(image)

      await waitFor(() => {
        expect(screen.getByTestId('image-gallery')).toBeTruthy()
      })
    })
  })

  describe('styling', () => {
    it('applies rounded-sm class to image', () => {
      render(<MarkdownImage src="https://example.com/image.png" />)

      const image = screen.getByTestId('image')
      expect(image.props.className).toContain('rounded-sm')
    })

    it('applies aspect-square w-1/3 to container', () => {
      const { toJSON } = render(<MarkdownImage src="https://example.com/image.png" />)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('aspect-square')
      expect(className).toContain('w-1/3')
    })
  })
})

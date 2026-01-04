import '../../__mocks__/nativeModules'

import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { MarkdownMathInline } from '../MarkdownMathInline'

describe('MarkdownMathInline', () => {
  describe('content cleaning', () => {
    it('removes leading $ characters', () => {
      render(<MarkdownMathInline content="$x^2" />)

      expect(screen.getByTestId('mathjax')).toBeTruthy()
      expect(screen.getByText('x^2')).toBeTruthy()
    })

    it('removes trailing $ characters', () => {
      render(<MarkdownMathInline content="x^2$" />)

      expect(screen.getByText('x^2')).toBeTruthy()
    })

    it('removes multiple $ characters', () => {
      render(<MarkdownMathInline content="$$x^2$$" />)

      expect(screen.getByText('x^2')).toBeTruthy()
    })

    it('trims whitespace after cleaning', () => {
      render(<MarkdownMathInline content="$  x^2  $" />)

      expect(screen.getByText('x^2')).toBeTruthy()
    })

    it('returns null for empty content after cleaning', () => {
      const { toJSON } = render(<MarkdownMathInline content="$$" />)

      expect(toJSON()).toBeNull()
    })

    it('returns null for whitespace-only content after cleaning', () => {
      const { toJSON } = render(<MarkdownMathInline content="$   $" />)

      expect(toJSON()).toBeNull()
    })
  })

  describe('rendering', () => {
    it('renders MathJax component with cleaned content', () => {
      render(<MarkdownMathInline content="$x^2$" />)

      expect(screen.getByTestId('mathjax')).toBeTruthy()
    })

    it('applies fontSize of 16', () => {
      render(<MarkdownMathInline content="$x^2$" />)

      const mathjax = screen.getByTestId('mathjax')
      expect(mathjax.props['data-fontsize']).toBe(16)
    })

    it('renders in flex-row items-center container', () => {
      const { toJSON } = render(<MarkdownMathInline content="$x^2$" />)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('flex-row')
      expect(className).toContain('items-center')
    })
  })

  describe('edge cases', () => {
    it('handles content with only $ characters', () => {
      const { toJSON } = render(<MarkdownMathInline content="$$$$$" />)

      expect(toJSON()).toBeNull()
    })

    it('handles complex LaTeX expressions', () => {
      const latex = '\\frac{a}{b} + \\sqrt{c}'
      render(<MarkdownMathInline content={`$${latex}$`} />)

      expect(screen.getByTestId('mathjax')).toBeTruthy()
    })

    it('handles content with special characters', () => {
      const latex = '\\alpha + \\beta = \\gamma'
      render(<MarkdownMathInline content={`$${latex}$`} />)

      expect(screen.getByTestId('mathjax')).toBeTruthy()
    })

    it('handles content without $ characters', () => {
      render(<MarkdownMathInline content="x^2 + y^2" />)

      expect(screen.getByText('x^2 + y^2')).toBeTruthy()
    })

    it('handles single character content', () => {
      render(<MarkdownMathInline content="$x$" />)

      expect(screen.getByText('x')).toBeTruthy()
    })

    it('handles empty string', () => {
      const { toJSON } = render(<MarkdownMathInline content="" />)

      expect(toJSON()).toBeNull()
    })
  })
})

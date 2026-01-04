import '../../__mocks__/nativeModules'

import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { MarkdownMathBlock } from '../MarkdownMathBlock'

describe('MarkdownMathBlock', () => {
  describe('content cleaning', () => {
    it('removes leading $$ characters', () => {
      render(<MarkdownMathBlock content="$$x^2" />)

      expect(screen.getByTestId('mathjax')).toBeTruthy()
      // Content should have \displaystyle prefix
      expect(screen.getByText('\\displaystyle x^2')).toBeTruthy()
    })

    it('removes trailing $$ characters', () => {
      render(<MarkdownMathBlock content="x^2$$" />)

      expect(screen.getByText('\\displaystyle x^2')).toBeTruthy()
    })

    it('trims whitespace after cleaning', () => {
      render(<MarkdownMathBlock content="$$  x^2  $$" />)

      expect(screen.getByText('\\displaystyle x^2')).toBeTruthy()
    })

    it('returns null for empty content after cleaning', () => {
      const { toJSON } = render(<MarkdownMathBlock content="$$" />)

      expect(toJSON()).toBeNull()
    })

    it('returns null for whitespace-only content after cleaning', () => {
      const { toJSON } = render(<MarkdownMathBlock content="$$   $$" />)

      expect(toJSON()).toBeNull()
    })
  })

  describe('rendering', () => {
    it('renders MathJax with displaystyle prefix', () => {
      render(<MarkdownMathBlock content="$$x^2$$" />)

      expect(screen.getByText('\\displaystyle x^2')).toBeTruthy()
    })

    it('applies fontSize of 20', () => {
      render(<MarkdownMathBlock content="$$x^2$$" />)

      const mathjax = screen.getByTestId('mathjax')
      expect(mathjax.props['data-fontsize']).toBe(20)
    })

    it('centers content with items-center justify-center', () => {
      const { toJSON } = render(<MarkdownMathBlock content="$$x^2$$" />)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('items-center')
      expect(className).toContain('justify-center')
    })

    it('applies my-3 px-5 py-5 rounded-xl styling', () => {
      const { toJSON } = render(<MarkdownMathBlock content="$$x^2$$" />)

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('my-3')
      expect(className).toContain('px-5')
      expect(className).toContain('py-5')
      expect(className).toContain('rounded-xl')
    })
  })

  describe('LaTeX formatting', () => {
    it('wraps content with \\displaystyle prefix', () => {
      render(<MarkdownMathBlock content="x + y" />)

      expect(screen.getByText('\\displaystyle x + y')).toBeTruthy()
    })

    it('handles complex LaTeX block expressions', () => {
      const latex = '\\int_{0}^{\\infty} e^{-x} dx'
      render(<MarkdownMathBlock content={`$$${latex}$$`} />)

      expect(screen.getByTestId('mathjax')).toBeTruthy()
    })

    it('handles multi-line LaTeX', () => {
      const multiLine = 'a = b \\\\ c = d'
      render(<MarkdownMathBlock content={`$$${multiLine}$$`} />)

      expect(screen.getByText(`\\displaystyle ${multiLine}`)).toBeTruthy()
    })

    it('handles matrix notation', () => {
      const matrix = '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'
      render(<MarkdownMathBlock content={`$$${matrix}$$`} />)

      expect(screen.getByText(`\\displaystyle ${matrix}`)).toBeTruthy()
    })
  })

  describe('edge cases', () => {
    it('handles content with only $ characters', () => {
      const { toJSON } = render(<MarkdownMathBlock content="$$$$$" />)

      expect(toJSON()).toBeNull()
    })

    it('handles empty string', () => {
      const { toJSON } = render(<MarkdownMathBlock content="" />)

      expect(toJSON()).toBeNull()
    })

    it('handles content without $ characters', () => {
      render(<MarkdownMathBlock content="x^2 + y^2" />)

      expect(screen.getByText('\\displaystyle x^2 + y^2')).toBeTruthy()
    })

    it('handles single $ characters (not block)', () => {
      render(<MarkdownMathBlock content="$x^2$" />)

      expect(screen.getByText('\\displaystyle x^2')).toBeTruthy()
    })

    it('handles Greek letters', () => {
      const latex = '\\alpha \\beta \\gamma'
      render(<MarkdownMathBlock content={`$$${latex}$$`} />)

      expect(screen.getByTestId('mathjax')).toBeTruthy()
    })
  })
})

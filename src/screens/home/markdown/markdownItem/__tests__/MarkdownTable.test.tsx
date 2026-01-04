import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { MarkdownTable } from '../MarkdownTable'
import { MarkdownTableBody } from '../MarkdownTableBody'
import { MarkdownTableCell } from '../MarkdownTableCell'
import { MarkdownTableHead } from '../MarkdownTableHead'
import { MarkdownTableRow } from '../MarkdownTableRow'

describe('Table Components', () => {
  describe('MarkdownTable', () => {
    it('renders children in bordered container', () => {
      render(
        <MarkdownTable>
          <Text>Table content</Text>
        </MarkdownTable>
      )

      expect(screen.getByText('Table content')).toBeTruthy()
    })

    it('applies rounded-md class', () => {
      const { toJSON } = render(
        <MarkdownTable>
          <Text>Table</Text>
        </MarkdownTable>
      )

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('rounded-md')
    })

    it('applies border border-border class', () => {
      const { toJSON } = render(
        <MarkdownTable>
          <Text>Table</Text>
        </MarkdownTable>
      )

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('border')
      expect(className).toContain('border-border')
    })

    it('applies my-4 vertical margin', () => {
      const { toJSON } = render(
        <MarkdownTable>
          <Text>Table</Text>
        </MarkdownTable>
      )

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('my-4')
    })
  })

  describe('MarkdownTableHead', () => {
    it('renders children with muted background', () => {
      render(
        <MarkdownTableHead>
          <Text>Header content</Text>
        </MarkdownTableHead>
      )

      expect(screen.getByText('Header content')).toBeTruthy()
    })

    it('applies bg-muted class', () => {
      const { toJSON } = render(
        <MarkdownTableHead>
          <Text>Header</Text>
        </MarkdownTableHead>
      )

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('bg-muted')
    })
  })

  describe('MarkdownTableBody', () => {
    it('renders children in View container', () => {
      render(
        <MarkdownTableBody>
          <Text>Body content</Text>
        </MarkdownTableBody>
      )

      expect(screen.getByText('Body content')).toBeTruthy()
    })

    it('has no special styling classes', () => {
      const { toJSON } = render(
        <MarkdownTableBody>
          <Text>Body</Text>
        </MarkdownTableBody>
      )

      const tree = toJSON()
      // Should be a simple View with no specific styling
      expect(tree).toBeTruthy()
    })
  })

  describe('MarkdownTableRow', () => {
    it('renders children in flex-row layout', () => {
      render(
        <MarkdownTableRow>
          <Text>Row content</Text>
        </MarkdownTableRow>
      )

      expect(screen.getByText('Row content')).toBeTruthy()
    })

    it('applies flex-row class', () => {
      const { toJSON } = render(
        <MarkdownTableRow>
          <Text>Row</Text>
        </MarkdownTableRow>
      )

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('flex-row')
    })

    it('applies border-b border-border class', () => {
      const { toJSON } = render(
        <MarkdownTableRow>
          <Text>Row</Text>
        </MarkdownTableRow>
      )

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('border-b')
      expect(className).toContain('border-border')
    })
  })

  describe('MarkdownTableCell', () => {
    it('renders children as text', () => {
      render(
        <MarkdownTableCell>
          <Text>Cell content</Text>
        </MarkdownTableCell>
      )

      expect(screen.getByText('Cell content')).toBeTruthy()
    })

    it('applies font-bold when isHeader=true', () => {
      const { toJSON } = render(
        <MarkdownTableCell isHeader={true}>
          <Text>Header Cell</Text>
        </MarkdownTableCell>
      )

      const tree = toJSON()
      // Find the Text child
      const children = (tree as { children?: Array<{ props?: { className?: string } }> })?.children
      const textChild = children?.[0]
      expect(textChild?.props?.className).toContain('font-bold')
    })

    it('does not apply font-bold when isHeader=false', () => {
      const { toJSON } = render(
        <MarkdownTableCell isHeader={false}>
          <Text>Normal Cell</Text>
        </MarkdownTableCell>
      )

      const tree = toJSON()
      const children = (tree as { children?: Array<{ props?: { className?: string } }> })?.children
      const textChild = children?.[0]
      expect(textChild?.props?.className).not.toContain('font-bold')
    })

    it('does not apply font-bold when isHeader is undefined', () => {
      const { toJSON } = render(
        <MarkdownTableCell>
          <Text>Normal Cell</Text>
        </MarkdownTableCell>
      )

      const tree = toJSON()
      const children = (tree as { children?: Array<{ props?: { className?: string } }> })?.children
      const textChild = children?.[0]
      expect(textChild?.props?.className).not.toContain('font-bold')
    })

    it('applies flex-1 p-2 class', () => {
      const { toJSON } = render(
        <MarkdownTableCell>
          <Text>Cell</Text>
        </MarkdownTableCell>
      )

      const tree = toJSON()
      const className = (tree as { props?: { className?: string } })?.props?.className
      expect(className).toContain('flex-1')
      expect(className).toContain('p-2')
    })

    it('applies text-foreground class', () => {
      const { toJSON } = render(
        <MarkdownTableCell>
          <Text>Cell</Text>
        </MarkdownTableCell>
      )

      const tree = toJSON()
      const children = (tree as { children?: Array<{ props?: { className?: string } }> })?.children
      const textChild = children?.[0]
      expect(textChild?.props?.className).toContain('text-foreground')
    })
  })

  describe('integration', () => {
    it('renders complete table structure correctly', () => {
      render(
        <MarkdownTable>
          <MarkdownTableHead>
            <MarkdownTableRow>
              <MarkdownTableCell isHeader>Header 1</MarkdownTableCell>
              <MarkdownTableCell isHeader>Header 2</MarkdownTableCell>
            </MarkdownTableRow>
          </MarkdownTableHead>
          <MarkdownTableBody>
            <MarkdownTableRow>
              <MarkdownTableCell>Cell 1</MarkdownTableCell>
              <MarkdownTableCell>Cell 2</MarkdownTableCell>
            </MarkdownTableRow>
          </MarkdownTableBody>
        </MarkdownTable>
      )

      expect(screen.getByText('Header 1')).toBeTruthy()
      expect(screen.getByText('Header 2')).toBeTruthy()
      expect(screen.getByText('Cell 1')).toBeTruthy()
      expect(screen.getByText('Cell 2')).toBeTruthy()
    })

    it('handles complex table with multiple rows and cells', () => {
      render(
        <MarkdownTable>
          <MarkdownTableBody>
            <MarkdownTableRow>
              <MarkdownTableCell>R1C1</MarkdownTableCell>
              <MarkdownTableCell>R1C2</MarkdownTableCell>
              <MarkdownTableCell>R1C3</MarkdownTableCell>
            </MarkdownTableRow>
            <MarkdownTableRow>
              <MarkdownTableCell>R2C1</MarkdownTableCell>
              <MarkdownTableCell>R2C2</MarkdownTableCell>
              <MarkdownTableCell>R2C3</MarkdownTableCell>
            </MarkdownTableRow>
          </MarkdownTableBody>
        </MarkdownTable>
      )

      expect(screen.getByText('R1C1')).toBeTruthy()
      expect(screen.getByText('R2C3')).toBeTruthy()
    })

    it('handles empty table gracefully', () => {
      const { toJSON } = render(<MarkdownTable>{null}</MarkdownTable>)

      expect(toJSON()).toBeTruthy()
    })
  })
})

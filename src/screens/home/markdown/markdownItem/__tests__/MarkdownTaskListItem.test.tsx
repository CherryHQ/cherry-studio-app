import '../../__mocks__/nativeModules'

import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { MarkdownTaskListItem } from '../MarkdownTaskListItem'

describe('MarkdownTaskListItem', () => {
  describe('checked state', () => {
    it('renders SquareCheck icon when checked=true', () => {
      render(
        <MarkdownTaskListItem checked={true}>
          <Text>Task</Text>
        </MarkdownTaskListItem>
      )

      expect(screen.getByTestId('icon-square-check')).toBeTruthy()
    })

    it('renders Square icon when checked=false', () => {
      render(
        <MarkdownTaskListItem checked={false}>
          <Text>Task</Text>
        </MarkdownTaskListItem>
      )

      expect(screen.getByTestId('icon-square')).toBeTruthy()
    })

    it('renders Square icon when checked is undefined', () => {
      render(
        <MarkdownTaskListItem>
          <Text>Task</Text>
        </MarkdownTaskListItem>
      )

      expect(screen.getByTestId('icon-square')).toBeTruthy()
    })
  })

  it('renders children content', () => {
    render(
      <MarkdownTaskListItem checked={false}>
        <Text>Task content here</Text>
      </MarkdownTaskListItem>
    )

    expect(screen.getByText('Task content here')).toBeTruthy()
  })

  it('applies flex-row items-start layout', () => {
    const { toJSON } = render(
      <MarkdownTaskListItem checked={false}>
        <Text>Task</Text>
      </MarkdownTaskListItem>
    )

    const tree = toJSON()
    const className = (tree as { props?: { className?: string } })?.props?.className
    expect(className).toContain('flex-row')
    expect(className).toContain('items-start')
  })

  it('applies mr-2 to checkbox container for spacing', () => {
    const { toJSON } = render(
      <MarkdownTaskListItem checked={false}>
        <Text>Task</Text>
      </MarkdownTaskListItem>
    )

    const tree = toJSON()
    const children = (tree as { children?: { props?: { className?: string } }[] })?.children
    const checkboxContainer = children?.[0]
    expect(checkboxContainer?.props?.className).toContain('mr-2')
  })

  it('applies flex-1 to content container', () => {
    const { toJSON } = render(
      <MarkdownTaskListItem checked={false}>
        <Text>Task</Text>
      </MarkdownTaskListItem>
    )

    const tree = toJSON()
    const children = (tree as { children?: { props?: { className?: string } }[] })?.children
    const contentContainer = children?.[1]
    expect(contentContainer?.props?.className).toContain('flex-1')
  })

  it('handles multiple children', () => {
    render(
      <MarkdownTaskListItem checked={true}>
        <Text>First</Text>
        <Text>Second</Text>
      </MarkdownTaskListItem>
    )

    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
  })

  it('handles empty children', () => {
    const { toJSON } = render(<MarkdownTaskListItem checked={false}>{null}</MarkdownTaskListItem>)

    expect(toJSON()).toBeTruthy()
    // Checkbox should still be present
    expect(screen.getByTestId('icon-square')).toBeTruthy()
  })
})

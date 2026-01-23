import { Select } from 'heroui-native'
import type { FC } from 'react'
import React from 'react'

export interface SelectionDropdownItem {
  id?: string
  key?: string
  label: React.ReactNode | string
  onSelect?: () => void
  [x: string]: any
}

export interface SelectionDropdownProps {
  items: SelectionDropdownItem[]
  children: React.ReactNode
  shouldDismissMenuOnSelect?: boolean
  value?: string
  onValueChange?: (value: string) => void
  usePortal?: boolean
}

const SelectionDropdown: FC<SelectionDropdownProps> = ({
  items,
  children,
  shouldDismissMenuOnSelect = true,
  usePortal = true,
  onValueChange
}) => {
  const handleValueChange = (selectedItem: any) => {
    const newValue = selectedItem?.value || selectedItem
    onValueChange?.(newValue)

    const foundItem = items.find(item => item.id === newValue || item.key === newValue)
    if (foundItem) {
      foundItem.onSelect?.()
    }
  }

  const renderItems = () =>
    items.map((item, index) => {
      const itemValue = item.id || item.key || String(index)
      const itemLabel = typeof item.label === 'string' ? item.label : `Item ${index + 1}`
      return <Select.Item key={itemValue} value={itemValue} label={itemLabel} />
    })

  const contentProps = {
    width: 'trigger' as const,
    placement: 'bottom' as const,
    align: 'center' as const
  }

  return (
    <Select onValueChange={handleValueChange}>
      <Select.Trigger asChild>{children}</Select.Trigger>

      {usePortal ? (
        <Select.Portal>
          <Select.Overlay closeOnPress={shouldDismissMenuOnSelect} />
          <Select.Content {...contentProps}>{renderItems()}</Select.Content>
        </Select.Portal>
      ) : (
        <>
          <Select.Overlay closeOnPress={shouldDismissMenuOnSelect} />
          <Select.Content {...contentProps}>{renderItems()}</Select.Content>
        </>
      )}
    </Select>
  )
}

export default SelectionDropdown

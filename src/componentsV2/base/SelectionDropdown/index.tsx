import { Select } from 'heroui-native'
import type { FC } from 'react'
import React from 'react'
import type { SFSymbol } from 'sf-symbols-typescript'

interface SelectOption {
  value: string
  label: string
}

export interface SelectionDropdownItem {
  id?: string
  key?: string
  label: React.ReactNode | string
  icon?: React.ReactNode
  iOSIcon?: SFSymbol | string
  isSelected?: boolean
  destructive?: boolean
  onSelect?: () => void
}

export interface SelectionDropdownProps {
  items: SelectionDropdownItem[]
  children: React.ReactNode
  shouldDismissMenuOnSelect?: boolean
  onValueChange?: (value: string) => void
}

const SelectionDropdown: FC<SelectionDropdownProps> = ({
  items,
  children,
  shouldDismissMenuOnSelect = true,
  onValueChange
}) => {
  const handleValueChange = (selectedItem: SelectOption | undefined) => {
    if (!selectedItem) {
      return
    }

    const newValue = selectedItem.value

    if (onValueChange) {
      onValueChange(newValue)
    }

    const foundItem = items.find(item => item.id === newValue || item.key === newValue)
    if (foundItem && foundItem.onSelect) {
      foundItem.onSelect()
    }
  }

  const renderItems = () =>
    items.map((item, index) => {
      const itemValue = item.id || item.key || String(index)
      const itemLabel = typeof item.label === 'string' ? item.label : `Item ${index + 1}`
      return <Select.Item key={itemValue} value={itemValue} label={itemLabel} />
    })

  return (
    <Select onValueChange={handleValueChange}>
      <Select.Trigger asChild>{children}</Select.Trigger>
      <Select.Portal>
        <Select.Overlay closeOnPress={shouldDismissMenuOnSelect} />
        <Select.Content width="trigger" placement="bottom" align="center">
          {renderItems()}
        </Select.Content>
      </Select.Portal>
    </Select>
  )
}

export default SelectionDropdown

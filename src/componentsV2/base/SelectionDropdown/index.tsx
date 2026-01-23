import { Select } from 'heroui-native';
import React, { useState } from 'react'

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

const SelectionDropdown: React.FC<SelectionDropdownProps> = ({
  items,
children,  
shouldDismissMenuOnSelect = true,
  value: externalValue,
  usePortal = true,
  onValueChange
}) => {
  const [, setInternalValue] = useState('')
  const isControlled = externalValue !== undefined
  const handleValueChange = (selectedItem: any) => {
    const newValue = selectedItem?.value || selectedItem
    if (!isControlled) {
      setInternalValue(newValue)
    }
    onValueChange?.(newValue)
    const foundItem = items.find(item =>
      item.id === newValue || item.key === newValue
    )

    if (foundItem) {
      foundItem.onSelect?.()
    } else {
      console.warn('Cannot find item, use default value:', newValue)
    }
  }
  return (
    <Select
      onValueChange={handleValueChange}
    >
      <Select.Trigger asChild>
        {children}
      </Select.Trigger>

      {usePortal ? (
        <Select.Portal>
          <Select.Overlay closeOnPress={shouldDismissMenuOnSelect} />
          <Select.Content
            style={{ width: '40%' }}
            width="trigger"
            placement="bottom"
            align="center"
          >
            {items.map((item, index) => {
              const itemValue = item.id || item.key || String(index)
              const itemLabel = typeof item.label === 'string'
                ? item.label
                : `Unknown Label${index + 1}`

              return (
                <Select.Item
                  key={itemValue}
                  value={itemValue}
                  label={itemLabel}
                />
              )
            })}
          </Select.Content>
        </Select.Portal>
      ) : (
        <>
          <Select.Overlay closeOnPress={shouldDismissMenuOnSelect} />
          <Select.Content
            className='className="w-[40%]"'
            width="trigger"
            align="center"
          >
            {items.map((item, index) => {
              const itemValue = item.id || item.key || String(index)
              const itemLabel = typeof item.label === 'string'
                ? item.label
                : `Unknown Label${index + 1}`

              return (
                <Select.Item
                  key={itemValue}
                  value={itemValue}
                  label={itemLabel}
                />
              )
            })}
          </Select.Content>
        </>
      )}
    </Select>
  )
}

export default SelectionDropdown

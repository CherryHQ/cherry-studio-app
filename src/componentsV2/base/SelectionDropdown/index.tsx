import React from 'react'
import type { SFSymbol } from 'sf-symbols-typescript'
import * as DropdownMenu from 'zeego/dropdown-menu'

import { isIOS } from '@/utils/device'

export interface SelectionDropdownItem {
  id?: string
  key?: string
  label: React.ReactNode | string
  description?: React.ReactNode | string
  icon?: React.ReactNode | ((isSelected: boolean) => React.ReactNode)
  iOSIcon?: SFSymbol | string
  isSelected?: boolean
  onSelect?: () => void
  destructive?: boolean
  [x: string]: any
}

export interface SelectionDropdownProps {
  items: SelectionDropdownItem[]
  children: React.ReactNode
  shouldDismissMenuOnSelect?: boolean
}

/**
 * 用于显示下拉选择菜单的组件
 * 使用 Zeego dropdown menu 实现，支持原生体验
 */
const SelectionDropdown: React.FC<SelectionDropdownProps> = ({ items, children, shouldDismissMenuOnSelect = true }) => {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>{children}</DropdownMenu.Trigger>

      <DropdownMenu.Content>
        {items.map((item, index) => {
          const itemKey = item.key?.toString() || item.id?.toString() || index.toString()
          const iconElement = typeof item.icon === 'function' ? item.icon(item.isSelected ?? false) : item.icon

          return (
            <DropdownMenu.CheckboxItem
              destructive={item.destructive}
              shouldDismissMenuOnSelect={shouldDismissMenuOnSelect}
              key={itemKey}
              value={item.isSelected ? 'on' : 'off'}
              onValueChange={() => item.onSelect?.()}>
              {isIOS && item.iOSIcon && <DropdownMenu.ItemIcon ios={{ name: item.iOSIcon }} />}
              {!isIOS && iconElement && <DropdownMenu.ItemIcon>{iconElement}</DropdownMenu.ItemIcon>}
              <DropdownMenu.ItemTitle>{item.label}</DropdownMenu.ItemTitle>
            </DropdownMenu.CheckboxItem>
          )
        })}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}

export default SelectionDropdown

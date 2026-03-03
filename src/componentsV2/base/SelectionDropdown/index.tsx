import { TrueSheet } from '@lodev09/react-native-true-sheet'
import type { FC } from 'react'
import React, { useId } from 'react'
import { Pressable } from 'react-native'
import type { SFSymbol } from 'sf-symbols-typescript'
import * as ZeegoDropdownMenu from 'zeego/dropdown-menu'

import { isIOS } from '@/utils/device'

import SelectionSheet from '../SelectionSheet'

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
  const sheetName = useId()

  const handleSelect = (item: SelectionDropdownItem) => {
    const value = item.id || item.key
    if (value && onValueChange) {
      onValueChange(value)
    }
    item.onSelect?.()
  }

  // iOS: 使用 zeego DropdownMenu 原生下拉菜单
  if (isIOS) {
    const { Root, Trigger, Content, Item, ItemTitle, ItemIcon, CheckboxItem } = ZeegoDropdownMenu

    return (
      <Root>
        <Trigger asChild>
          <Pressable>{children}</Pressable>
        </Trigger>
        <Content>
          {items.map((item, index) => {
            const itemKey = item.id || item.key || String(index)

            // 如果需要显示选中状态，使用 CheckboxItem
            if (item.isSelected !== undefined) {
              return (
                <CheckboxItem
                  key={itemKey}
                  value={item.isSelected ? 'on' : 'off'}
                  onValueChange={() => handleSelect(item)}
                  shouldDismissMenuOnSelect={shouldDismissMenuOnSelect}>
                  <ItemTitle>{typeof item.label === 'string' ? item.label : `Item ${index + 1}`}</ItemTitle>
                  {item.iOSIcon && <ItemIcon ios={{ name: item.iOSIcon as SFSymbol }} />}
                </CheckboxItem>
              )
            }

            return (
              <Item
                key={itemKey}
                destructive={item.destructive}
                onSelect={() => handleSelect(item)}
                shouldDismissMenuOnSelect={shouldDismissMenuOnSelect}>
                <ItemTitle>{typeof item.label === 'string' ? item.label : `Item ${index + 1}`}</ItemTitle>
                {item.iOSIcon && <ItemIcon ios={{ name: item.iOSIcon as SFSymbol }} />}
              </Item>
            )
          })}
        </Content>
      </Root>
    )
  } else {
    const openBottomSheet = () => {
      TrueSheet.present(sheetName)
    }

    const closeBottomSheet = () => {
      TrueSheet.dismiss(sheetName)
    }

    const onAndroidSelect = (item: SelectionDropdownItem) => {
      if (shouldDismissMenuOnSelect) {
        closeBottomSheet()
      }
      handleSelect(item)
    }

    return (
      <>
        <Pressable onPress={openBottomSheet}>{children}</Pressable>

        <SelectionSheet
          name={sheetName}
          detents={['auto', 0.6]}
          items={items.map(item => ({
            key: item.id || item.key || String(items.indexOf(item)),
            label: item.label,
            icon: item.icon,
            isSelected: item.isSelected,
            destructive: item.destructive,
            onSelect: () => onAndroidSelect(item)
          }))}
        />
      </>
    )
  }
}

export default SelectionDropdown

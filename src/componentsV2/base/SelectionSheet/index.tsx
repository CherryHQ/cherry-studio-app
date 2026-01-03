import { LegendList } from '@legendapp/list'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Button, cn } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { BackHandler, Platform, View } from 'react-native'

import { Check } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useBottom } from '@/hooks/useBottom'
import { useTheme } from '@/hooks/useTheme'
import { isIOS26 } from '@/utils/device'

import Text from '../Text'

export interface SelectionSheetItem {
  label: React.ReactNode | string
  description?: React.ReactNode | string
  icon?: React.ReactNode | ((isSelected: boolean) => React.ReactNode)
  isSelected?: boolean
  backgroundColor?: string
  color?: string
  onSelect?: () => void
  [x: string]: any
}

export interface SelectionSheetProps {
  name: string
  items: SelectionSheetItem[]
  emptyContent?: React.ReactNode
  detents?: ('auto' | number)[]
  placeholder?: string
  shouldDismiss?: boolean
  headerComponent?: React.ReactNode
}

/**
 * Present the SelectionSheet globally by name
 */
export const presentSelectionSheet = (name: string) => TrueSheet.present(name)

/**
 * Dismiss the SelectionSheet globally by name
 */
export const dismissSelectionSheet = (name: string) => TrueSheet.dismiss(name)

/**
 * 用于在 TrueSheet 中显示列表
 */

const SelectionSheet: React.FC<SelectionSheetProps> = ({
  name,
  items,
  emptyContent,
  detents = ['auto'],
  placeholder,
  shouldDismiss = true,
  headerComponent
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const bottom = useBottom()
  const { isDark } = useTheme()

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      TrueSheet.dismiss(name)
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [name, isVisible])

  const handleSelect = (item: SelectionSheetItem) => {
    if (shouldDismiss) {
      TrueSheet.dismiss(name)
    }

    item.onSelect?.()
  }

  const renderItem = ({ item }: { item: SelectionSheetItem }) => {
    const iconElement = typeof item.icon === 'function' ? item.icon(item.isSelected ?? false) : item.icon
    const labelElement =
      typeof item.label === 'string' ? (
        <Text
          className={cn(
            `text-base ${item.isSelected ? 'primary-text' : 'text-foreground'}`,
            item.color && !item.isSelected ? item.color : undefined
          )}>
          {item.label}
        </Text>
      ) : (
        item.label
      )
    const descriptionElement =
      typeof item.description === 'string' ? (
        <Text
          className={cn(
            `flex-1 text-[11px] opacity-70 ${item.isSelected ? 'primary-text' : 'text-foreground-secondary'}`,
            item.color && !item.isSelected ? item.color : undefined
          )}
          numberOfLines={1}
          ellipsizeMode="tail">
          {item.description}
        </Text>
      ) : (
        item.description
      )
    return (
      <Button onPress={() => handleSelect(item)} variant="ghost" className="h-auto min-h-0 rounded-xl p-0">
        <XStack
          className={cn(
            `items-center gap-2.5 rounded-lg border px-3.5 py-3 ${
              item.isSelected ? 'secondary-container' : 'border-transparent bg-zinc-400/10'
            }`,
            item.backgroundColor && !item.isSelected ? item.backgroundColor : undefined
          )}>
          {iconElement}
          <XStack className="flex-1 items-center justify-between gap-2.5">
            {labelElement}
            {descriptionElement}
          </XStack>
          {item.isSelected && <Check size={20} className="primary-text" />}
        </XStack>
      </Button>
    )
  }

  const keyExtractor = (item: SelectionSheetItem, index: number) =>
    item.key?.toString() || item.id?.toString() || item.label?.toString() || index.toString()

  const listHeaderComponent = () =>
    placeholder || headerComponent ? (
      <View className="gap-2 pb-2 pt-5">
        {headerComponent}
        {placeholder && <Text className="text-foreground-secondary text-center text-sm opacity-60">{placeholder}</Text>}
      </View>
    ) : (
      <YStack className="h-5" />
    )

  return (
    <TrueSheet
      name={name}
      detents={detents}
      cornerRadius={24}
      grabber={Platform.OS === 'ios'}
      dismissible
      dimmed
      scrollable
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      onDidDismiss={() => setIsVisible(false)}
      onDidPresent={() => setIsVisible(true)}
      style={{ paddingBottom: bottom + 10 }}>
      <View className="flex-1">
        <LegendList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          nestedScrollEnabled={Platform.OS === 'android'}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={60}
          ListHeaderComponent={listHeaderComponent}
          ItemSeparatorComponent={() => <YStack className="h-2.5" />}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          ListEmptyComponent={emptyContent ? <YStack className="gap-2.5 px-4 pb-7">{emptyContent}</YStack> : undefined}
          recycleItems
        />
      </View>
    </TrueSheet>
  )
}

export default SelectionSheet

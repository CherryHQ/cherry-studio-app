import { BottomSheetBackdrop, BottomSheetModal, useBottomSheetScrollableCreator } from '@gorhom/bottom-sheet'
import { LegendList } from '@legendapp/list'
import { cn } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { BackHandler, TouchableOpacity, View } from 'react-native'

import { Check } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'

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
  items: SelectionSheetItem[]
  emptyContent?: React.ReactNode
  snapPoints?: string[]
  ref: React.RefObject<BottomSheetModal | null>
  placeholder?: string
  shouldDismiss?: boolean
}

/**
 * 用于在BottomSheetModal中显示列表
 */

const SelectionSheet: React.FC<SelectionSheetProps> = ({
  items,
  emptyContent,
  snapPoints = [],
  ref,
  placeholder,
  shouldDismiss = true
}) => {
  const { isDark } = useTheme()
  const [isVisible, setIsVisible] = useState(false)
  const BottomSheetLegendListScrollable = useBottomSheetScrollableCreator()

  useEffect(() => {
    if (!isVisible || !ref?.current) return

    const backAction = () => {
      ref.current?.dismiss()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [ref, isVisible])

  const handleSelect = (item: SelectionSheetItem) => {
    if (shouldDismiss) {
      ref.current?.dismiss()
    }

    item.onSelect?.()
  }

  const renderItem = ({ item }: { item: SelectionSheetItem }) => {
    const iconElement = typeof item.icon === 'function' ? item.icon(item.isSelected ?? false) : item.icon
    const labelElement =
      typeof item.label === 'string' ? (
        <Text
          className={cn(
            `text-base ${item.isSelected ? 'text-green-100' : 'text-text-primary'}`,
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
            `flex-1 text-[11px] opacity-70 ${item.isSelected ? 'text-green-100' : 'text-text-secondary'}`,
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
      <TouchableOpacity onPress={() => handleSelect(item)} activeOpacity={0.5}>
        <XStack
          className={cn(
            `items-center gap-2.5 rounded-lg border px-3.5 py-3 ${
              item.isSelected ? 'border-green-20 bg-green-10' : 'bg-ui-card-background border-transparent'
            }`,
            item.backgroundColor && !item.isSelected ? item.backgroundColor : undefined
          )}>
          {iconElement}
          <XStack className="flex-1 items-center justify-between gap-2.5">
            {labelElement}
            {descriptionElement}
          </XStack>
          {item.isSelected && <Check size={20} className="text-green-100" />}
        </XStack>
      </TouchableOpacity>
    )
  }

  const keyExtractor = (item: SelectionSheetItem, index: number) =>
    item.key?.toString() || item.id?.toString() || item.label?.toString() || index.toString()

  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
  )

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      enableDynamicSizing={snapPoints.length === 0}
      backgroundStyle={{
        borderRadius: 24,
        backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
      }}
      handleIndicatorStyle={{
        backgroundColor: isDark ? '#f9f9f9ff' : '#202020ff'
      }}
      backdropComponent={renderBackdrop}
      onDismiss={() => setIsVisible(false)}
      onChange={index => setIsVisible(index >= 0)}>
      <LegendList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={60}
        ItemSeparatorComponent={() => <YStack className="h-2.5" />}
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16 }}
        renderScrollComponent={BottomSheetLegendListScrollable}
        ListHeaderComponent={
          placeholder ? (
            <View className="px-4 pb-2">
              <Text className="text-text-secondary text-center text-sm opacity-60">{placeholder}</Text>
            </View>
          ) : undefined
        }
        ListEmptyComponent={emptyContent ? <YStack className="gap-2.5 px-4 pb-7">{emptyContent}</YStack> : undefined}
        recycleItems
      />
    </BottomSheetModal>
  )
}

export default SelectionSheet

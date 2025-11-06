import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Search } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'

interface BottomSheetSearchInputProps {
  placeholder?: string
  onChangeText?: (text: string) => void
  value?: string
}

export const BottomSheetSearchInput = ({ placeholder, onChangeText, value }: BottomSheetSearchInputProps) => {
  const { isDark } = useTheme()

  return (
    <XStack className="relative h-10 w-full items-center gap-2 rounded-lg">
      <BottomSheetTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={[
          styles.input,
          {
            borderColor: isDark ? '#acf3a633' : '#8de59e4d',
            color: isDark ? '#acf3a6ff' : '#81df94ff'
          }
        ]}
        placeholderTextColor={isDark ? '#acf3a6ff' : '#81df94ff'}
      />
      <YStack className="absolute left-4 top-[13px] z-10 h-5 w-5 items-center justify-center">
        <Search size={20} className="text-green-100" />
      </YStack>
    </XStack>
  )
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    height: 44,
    borderRadius: 24,
    paddingLeft: 42,
    paddingRight: 16,
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 16,
    width: '100%',
    borderWidth: 1
  }
})

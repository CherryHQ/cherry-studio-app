import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import Text from '@/componentsV2/base/Text'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'

interface MenuTabContentProps {
  title: string
  onSeeAllPress?: () => void
  children?: React.ReactNode
}

export function MenuTabContent({ title, onSeeAllPress, children }: MenuTabContentProps) {
  const { t } = useTranslation()

  return (
    <YStack className="flex-1 gap-2.5">
      <YStack className="px-5">
        <XStack className="items-center justify-between">
          <XStack className="items-center gap-2 py-2.5">
            <Text className="text-foreground">{title}</Text>
          </XStack>
          <Pressable
            onPress={onSeeAllPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Text className="text-blue-500">{t('menu.see_all')}</Text>
          </Pressable>
        </XStack>
      </YStack>
      {children}
    </YStack>
  )
}

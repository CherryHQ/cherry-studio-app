import { Star } from '@tamagui/lucide-icons'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button, ScrollView, Text, XStack, YStack } from 'tamagui'

import { SearchInput } from '@/components/ui/SearchInput'

interface MenuTabContentProps {
  searchPlaceholder: string
  title: string
  onSeeAllPress?: () => void
  children?: React.ReactNode
}

export function MenuTabContent({ searchPlaceholder, title, onSeeAllPress, children }: MenuTabContentProps) {
  const { t } = useTranslation()

  return (
    <YStack flex={1} gap={10}>
      <SearchInput placeholder={searchPlaceholder} />
      <ScrollView
        flex={1}
        contentContainerStyle={{
          paddingBottom: 20,
          gap: 20
        }}
        showsVerticalScrollIndicator={false}>
        <YStack>
          <XStack justifyContent="space-between" alignItems="center">
            <XStack gap={5} alignItems="center">
              <Star size={16} />
              <Text>{title}</Text>
            </XStack>
            <Button chromeless size="$1" padding={0} pressStyle={{ opacity: 0.7 }} onPress={onSeeAllPress}>
              <Text fontSize={10} color="$foregroundGreen">
                {t('menu.see_all')}
              </Text>
            </Button>
          </XStack>
        </YStack>
        {children}
      </ScrollView>
    </YStack>
  )
}

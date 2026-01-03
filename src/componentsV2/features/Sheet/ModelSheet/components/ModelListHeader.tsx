import { Button } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { SearchInput } from '@/componentsV2/base/SearchInput'
import Text from '@/componentsV2/base/Text'
import { BrushCleaning } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'

import { LAYOUT } from '../constants'

interface ModelListHeaderProps {
  searchQuery: string
  onSearchChange: (text: string) => void
  multiple?: boolean
  isMultiSelectActive: boolean
  onToggleMultiSelect: () => void
  onClearAll: () => void
}

export const ModelListHeader: React.FC<ModelListHeaderProps> = ({
  searchQuery,
  onSearchChange,
  multiple,
  isMultiSelectActive,
  onToggleMultiSelect,
  onClearAll
}) => {
  const { t } = useTranslation()

  return (
    <View
      className="bg-card"
      style={{
        paddingHorizontal: 10,
        height: LAYOUT.HEADER_HEIGHT
      }}>
      <YStack className="h-20 gap-4">
        <XStack className="flex-1 items-center justify-center gap-[5px]">
          <YStack className="flex-1">
            <SearchInput
              value={searchQuery}
              onChangeText={onSearchChange}
              placeholder={t('common.search_placeholder')}
            />
          </YStack>
          {multiple && (
            <Button
              pressableFeedbackVariant="ripple"
              size="sm"
              className={`h-10 rounded-xl ${
                isMultiSelectActive ? 'primary-container border' : 'bg-secondary border border-transparent'
              }`}
              onPress={onToggleMultiSelect}>
              <Button.Label>
                <Text className={isMultiSelectActive ? 'primary-text' : 'text-foreground'}>{t('button.multiple')}</Text>
              </Button.Label>
            </Button>
          )}
          {multiple && isMultiSelectActive && (
            <Button
              size="sm"
              pressableFeedbackVariant="ripple"
              className="bg-secondary h-10 rounded-full"
              isIconOnly
              onPress={onClearAll}>
              <Button.Label>
                <BrushCleaning size={18} className="text-foreground" />
              </Button.Label>
            </Button>
          )}
        </XStack>
      </YStack>
    </View>
  )
}

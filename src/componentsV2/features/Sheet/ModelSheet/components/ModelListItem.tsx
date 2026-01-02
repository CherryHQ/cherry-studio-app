import { cn } from 'heroui-native'
import React from 'react'
import { Pressable } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { ModelTags } from '@/componentsV2/features/ModelTags'
import { ModelIcon } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'

import type { ModelOption } from '../types'

interface ModelListItemProps {
  item: ModelOption
  isSelected: boolean
  onToggle: (modelValue: string) => void
}

export const ModelListItem: React.FC<ModelListItemProps> = ({ item, isSelected, onToggle }) => {
  return (
    <Pressable
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      onPress={() => onToggle(item.value)}
      className={`justify-between rounded-lg border px-2 ${
        isSelected ? 'primary-container' : 'border-transparent bg-transparent'
      }`}>
      <XStack className="w-full items-center gap-2 py-1">
        <XStack className="items-center justify-center">
          <ModelIcon model={item.model} size={24} />
        </XStack>
        <YStack className="flex-1 gap-1">
          <Text
            className={cn('text-sm leading-none', isSelected ? 'primary-text' : 'text-foreground')}
            numberOfLines={1}
            ellipsizeMode="tail">
            {item.label}
          </Text>
          <ModelTags model={item.model} size={11} />
        </YStack>
      </XStack>
    </Pressable>
  )
}

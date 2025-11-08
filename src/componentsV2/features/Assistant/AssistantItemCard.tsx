import { BlurView } from 'expo-blur'
import React, { memo } from 'react'
import { Platform, Pressable, View } from 'react-native'

import { Text, XStack, YStack } from '@/componentsV2'
import { useTheme } from '@/hooks/useTheme'
import type { Assistant } from '@/types/assistant'
import { formateEmoji } from '@/utils/formats'

import EmojiAvatar from './EmojiAvatar'
import GroupTag from './GroupTag'

interface AssistantItemCardProps {
  assistant: Assistant
  onAssistantPress: (assistant: Assistant) => void
}

const AssistantItemCard = ({ assistant, onAssistantPress }: AssistantItemCardProps) => {
  const { isDark } = useTheme()

  const emojiOpacity = Platform.OS === 'android' ? (isDark ? 0.1 : 0.9) : isDark ? 0.2 : 0.4

  const handlePress = () => {
    onAssistantPress(assistant)
  }

  return (
    <View className="w-full">
      <Pressable
        onPress={handlePress}
        className="bg-ui-card-background active:bg-gray-20 h-[230px] overflow-hidden rounded-2xl"
        style={{ height: 230 }}>
        {/* Background blur emoji */}
        <XStack className="absolute left-0 right-0 top-0 h-1/2 w-full flex-wrap">
          {Array.from({ length: 8 }).map((_, index) => (
            <View key={index} className="w-1/4 scale-150 items-center justify-center">
              <Text className="text-[40px]" style={{ opacity: emojiOpacity }}>
                {formateEmoji(assistant.emoji)}
              </Text>
            </View>
          ))}
        </XStack>

        {/* BlurView layer */}
        <BlurView
          intensity={90}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
          tint={isDark ? 'dark' : 'light'}
          style={{
            position: 'absolute',
            inset: 0
          }}
        />

        <YStack className="flex-1 items-center gap-2 rounded-2xl px-3.5 py-4">
          <EmojiAvatar emoji={assistant.emoji} size={90} borderWidth={5} borderColor={isDark ? '#333333' : '#f7f7f7'} />
          <Text className="text-text-primary text-center text-base" numberOfLines={1} ellipsizeMode="tail">
            {assistant.name}
          </Text>
          <YStack className="flex-1 items-center justify-between">
            <Text className="text-text-secondary text-xs leading-[14px]" numberOfLines={3} ellipsizeMode="tail">
              {assistant.description}
            </Text>
            <XStack className="h-[18px] flex-wrap justify-center gap-2.5 overflow-hidden">
              {assistant.group &&
                assistant.group.map((group, index) => (
                  <GroupTag
                    key={index}
                    group={group}
                    className="border-green-20 bg-green-10 border-[0.5px] text-[10px] text-green-100"
                  />
                ))}
            </XStack>
          </YStack>
        </YStack>
      </Pressable>
    </View>
  )
}

export default memo(AssistantItemCard)

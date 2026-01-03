import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { BlurView } from 'expo-blur'
import { Button, cn, Divider } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Text from '@/componentsV2/base/Text'
import { ModelIcon, UnionPlusIcon } from '@/componentsV2/icons'
import { Settings2, X } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { useToast } from '@/hooks/useToast'
import { useCurrentTopic } from '@/hooks/useTopic'
import { assistantService } from '@/services/AssistantService'
import { topicService } from '@/services/TopicService'
import type { Assistant } from '@/types/assistant'
import { uuid } from '@/utils'
import { isIOS, isIOS26 } from '@/utils/device'
import { formateEmoji } from '@/utils/formats'

import EmojiAvatar from './EmojiAvatar'
import GroupTag from './GroupTag'

const SHEET_NAME = 'assistant-item-sheet'

interface AssistantItemSheetData {
  assistant: Assistant | null
  source: 'builtIn' | 'external'
  onEdit?: (assistantId: string) => void
  onChatNavigation?: (topicId: string) => Promise<void>
  actionButton?: {
    text: string
    onPress: () => void
  }
}

// Global state for sheet data
let currentSheetData: AssistantItemSheetData = {
  assistant: null,
  source: 'external'
}
let updateSheetDataCallback: ((data: AssistantItemSheetData) => void) | null = null

export const presentAssistantItemSheet = (data: AssistantItemSheetData) => {
  currentSheetData = data
  updateSheetDataCallback?.(data)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissAssistantItemSheet = () => TrueSheet.dismiss(SHEET_NAME)

const AssistantItemSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const { bottom } = useSafeAreaInsets()
  const { switchTopic } = useCurrentTopic()
  const toast = useToast()
  const [isVisible, setIsVisible] = useState(false)
  const [sheetData, setSheetData] = useState<AssistantItemSheetData>(currentSheetData)

  const { assistant, source, onEdit, onChatNavigation, actionButton } = sheetData

  const emojiOpacity = Platform.OS === 'android' ? (isDark ? 0.2 : 0.9) : isDark ? 0.2 : 0.5

  useEffect(() => {
    updateSheetDataCallback = setSheetData
    return () => {
      updateSheetDataCallback = null
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissAssistantItemSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const handleChatPress = async () => {
    if (!assistant || !onChatNavigation) return

    let newAssistant: Assistant

    // 如果是从 AssistantScreen 来的（source: 'external'），说明是已有的助手，直接使用
    // 如果是从市场来的内置助手（source: 'builtIn'），才需要创建副本
    if (source === 'external' || assistant.type === 'external') {
      newAssistant = assistant
    } else {
      // 只有从市场首次添加的内置助手才需要创建副本
      newAssistant = {
        ...assistant,
        id: uuid(),
        type: 'external'
      }
      await assistantService.createAssistant(newAssistant)
    }

    const topic = await topicService.createTopic(newAssistant)
    await switchTopic(topic.id)
    await onChatNavigation(topic.id)

    dismissAssistantItemSheet()
  }

  const handleAddAssistant = async () => {
    if (assistant) {
      await assistantService.createAssistant({
        ...assistant,
        id: uuid(),
        type: 'external'
      })
      dismissAssistantItemSheet()
      toast.show(t('assistants.market.add.success', { assistant_name: assistant.name }))
    }
  }

  const handleEditAssistant = async () => {
    if (!assistant || !onEdit) return
    onEdit(assistant.id)
    dismissAssistantItemSheet()
  }

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={[0.9]}
      cornerRadius={30}
      dismissible
      dimmed
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      grabber={Platform.OS === 'ios' ? true : false}
      onDidDismiss={() => setIsVisible(false)}
      onDidPresent={() => setIsVisible(true)}>
      {!assistant ? null : (
        <YStack className={cn('relative gap-5', isIOS ? 'h-[85vh]' : 'h-full')}>
          {/* Background blur emoji */}
          <XStack className="absolute left-0 right-0 top-0 h-[200px] w-full flex-wrap overflow-hidden rounded-[30px]">
            {Array.from({ length: 70 }).map((_, index) => (
              <View key={index} className="w-[9.99%] scale-150 items-center justify-center">
                <Text className="text-[20px]" style={{ opacity: emojiOpacity }}>
                  {formateEmoji(assistant.emoji)}
                </Text>
              </View>
            ))}
          </XStack>

          {/* BlurView layer */}
          <BlurView
            intensity={Platform.OS === 'android' ? 90 : 90}
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
            tint={isDark ? 'dark' : 'light'}
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              borderRadius: 30
            }}
          />

          <Pressable
            style={({ pressed }) => ({
              position: 'absolute',
              top: 16,
              right: 16,
              padding: 4,
              backgroundColor: isDark ? '#333333' : '#dddddd',
              borderRadius: 16,
              opacity: pressed ? 0.7 : 1
            })}
            onPress={dismissAssistantItemSheet}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X className="h-4 w-4" />
          </Pressable>

          {/* Main Content */}
          <YStack className="flex-1 gap-4 px-6">
            {/* Header with emoji and groups */}
            <YStack className="items-center justify-center gap-5">
              <View className="mt-5">
                <EmojiAvatar
                  emoji={assistant.emoji}
                  size={120}
                  borderWidth={5}
                  borderColor={isDark ? '#333333' : '#ffffff'}
                />
              </View>
              <Text className="text-foreground text-center text-[22px] font-bold">{assistant.name}</Text>
              {assistant.group && assistant.group.length > 0 && (
                <XStack className="flex-wrap justify-center gap-2.5">
                  {assistant.group.map((group, index) => (
                    <GroupTag key={index} group={group} className="primary-badge border-[0.5px] px-2 text-xs" />
                  ))}
                </XStack>
              )}
              {assistant.defaultModel && (
                <XStack className="items-center justify-center gap-0.5">
                  <ModelIcon model={assistant.defaultModel} size={14} />
                  <Text className="text-foreground text-sm" numberOfLines={1} ellipsizeMode="tail">
                    {assistant.defaultModel.name}
                  </Text>
                </XStack>
              )}
            </YStack>

            <Divider />

            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 16 }}>
              <YStack className="gap-4">
                {/* Description */}
                {assistant.description && (
                  <YStack className="gap-1">
                    <Text className="text-foreground text-lg font-bold leading-5">{t('common.description')}</Text>
                    <Text className="text-foreground-secondary leading-5">{assistant.description}</Text>
                  </YStack>
                )}

                {/* Additional details could go here */}
                {assistant.prompt && (
                  <YStack className="gap-1">
                    <Text className="text-foreground text-lg font-bold leading-5">{t('common.prompt')}</Text>
                    <Text className="text-foreground text-base leading-5">{assistant.prompt}</Text>
                  </YStack>
                )}
              </YStack>
            </ScrollView>
          </YStack>

          {/* Footer positioned absolutely at the bottom */}
          <XStack className="shrink-0 items-center justify-between gap-4 px-6" style={{ paddingBottom: bottom }}>
            {source === 'builtIn' && (
              <Button pressableFeedbackVariant="ripple" variant="ghost" isIconOnly onPress={handleAddAssistant}>
                <Button.Label>
                  <UnionPlusIcon size={30} />
                </Button.Label>
              </Button>
            )}
            {source === 'external' && (
              <Button pressableFeedbackVariant="ripple" variant="ghost" isIconOnly onPress={handleEditAssistant}>
                <Button.Label>
                  <Settings2 size={30} />
                </Button.Label>
              </Button>
            )}
            <Button
              pressableFeedbackVariant="ripple"
              className="primary-container flex-1 rounded-[30px] px-5 py-2.5"
              onPress={actionButton?.onPress || handleChatPress}>
              <Button.Label>
                <Text className="primary-text text-[17px] font-bold">
                  {actionButton?.text || t('assistants.market.button.chat')}
                </Text>
              </Button.Label>
            </Button>
          </XStack>
        </YStack>
      )}
    </TrueSheet>
  )
}

AssistantItemSheet.displayName = 'AssistantItemSheet'

export default AssistantItemSheet

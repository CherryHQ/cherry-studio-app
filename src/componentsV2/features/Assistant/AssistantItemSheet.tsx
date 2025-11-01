import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { BlurView } from 'expo-blur'
import { Button, Divider, useTheme } from 'heroui-native'
import React, { forwardRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Text, XStack, YStack } from '@/componentsV2'
import { ModelIcon, UnionPlusIcon } from '@/componentsV2/icons'
import { Settings2, X } from '@/componentsV2/icons/LucideIcon'
import { useToast } from '@/hooks/useToast'
import { useCurrentTopic } from '@/hooks/useTopic'
import { assistantService } from '@/services/AssistantService'
import { topicService } from '@/services/TopicService'
import type { Assistant } from '@/types/assistant'
import { uuid } from '@/utils'
import { formateEmoji } from '@/utils/formats'

import EmojiAvatar from './EmojiAvatar'
import GroupTag from './GroupTag'

interface AssistantItemSheetProps {
  assistant: Assistant | null
  source: 'builtIn' | 'external'
  onEdit?: (assistantId: string) => void
  onChatNavigation?: (topicId: string) => Promise<void>
  actionButton?: {
    text: string
    onPress: () => void
  }
}

const AssistantItemSheet = forwardRef<BottomSheetModal, AssistantItemSheetProps>(
  ({ assistant, source, onEdit, onChatNavigation, actionButton }, ref) => {
    const { t } = useTranslation()
    const { isDark } = useTheme()
    const { bottom } = useSafeAreaInsets()
    const { switchTopic } = useCurrentTopic()
    const toast = useToast()
    const [isVisible, setIsVisible] = useState(false)

    const emojiOpacity = Platform.OS === 'android' ? (isDark ? 0.2 : 0.9) : isDark ? 0.2 : 0.5

    useEffect(() => {
      if (!isVisible) return

      const backAction = () => {
        ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
        return true
      }

      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
      return () => backHandler.remove()
    }, [ref, isVisible])

    const renderBackdrop = (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
    )

    const handleChatPress = async () => {
      if (!assistant || !onChatNavigation) return

      let newAssistant: Assistant

      if (assistant.type === 'external') {
        newAssistant = assistant
      } else {
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
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
    }

    const handleAddAssistant = async () => {
      if (assistant) {
        await assistantService.createAssistant({
          ...assistant,
          id: uuid(),
          type: 'external'
        })
        ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
        toast.show(t('assistants.market.add.success', { assistant_name: assistant.name }))
      }
    }

    const handleEditAssistant = async () => {
      if (!assistant || !onEdit) return
      onEdit(assistant.id)
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
    }

    return (
      <BottomSheetModal
        snapPoints={['90%']}
        enableDynamicSizing={false}
        ref={ref}
        backgroundStyle={{
          borderRadius: 30,
          backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
        }}
        handleComponent={() => null}
        backdropComponent={renderBackdrop}
        onDismiss={() => setIsVisible(false)}
        onChange={index => setIsVisible(index >= 0)}>
        {!assistant ? null : (
          <YStack className="relative flex-1 gap-10">
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

            <TouchableOpacity
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                padding: 4,
                backgroundColor: isDark ? '#333333' : '#dddddd',
                borderRadius: 16
              }}
              onPress={() => (ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X className="h-4 w-4" />
            </TouchableOpacity>

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
                <Text className="text-center text-[22px] font-bold text-text-primary dark:text-text-primary-dark">
                  {assistant.name}
                </Text>
                {assistant.group && assistant.group.length > 0 && (
                  <XStack className="flex-wrap justify-center gap-2.5">
                    {assistant.group.map((group, index) => (
                      <GroupTag
                        key={index}
                        group={group}
                        className="border-[0.5px] border-green-20 bg-green-10 px-2 text-xs text-green-100 dark:border-green-dark-20 dark:bg-green-dark-10 dark:text-green-dark-100"
                      />
                    ))}
                  </XStack>
                )}
                {assistant.defaultModel && (
                  <XStack className="items-center justify-center gap-0.5">
                    <ModelIcon model={assistant.defaultModel} size={14} />
                    <Text
                      className="text-sm text-text-primary dark:text-text-primary-dark"
                      numberOfLines={1}
                      ellipsizeMode="tail">
                      {assistant.defaultModel.name}
                    </Text>
                  </XStack>
                )}
              </YStack>

              <Divider />

              <BottomSheetScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 16 }}>
                <YStack className="gap-4">
                  {/* Description */}
                  {assistant.description && (
                    <YStack className="gap-1">
                      <Text className="text-lg font-bold leading-5 text-text-primary dark:text-text-primary-dark">
                        {t('common.description')}
                      </Text>
                      <Text className="leading-5 text-text-secondary dark:text-text-secondary-dark">
                        {assistant.description}
                      </Text>
                    </YStack>
                  )}

                  {/* Additional details could go here */}
                  {assistant.prompt && (
                    <YStack className="gap-1">
                      <Text className="text-lg font-bold leading-5 text-text-primary dark:text-text-primary-dark">
                        {t('common.prompt')}
                      </Text>
                      <Text className="text-base leading-5 text-text-primary dark:text-text-primary-dark">
                        {assistant.prompt}
                      </Text>
                    </YStack>
                  )}
                </YStack>
              </BottomSheetScrollView>
            </YStack>

            {/* Footer positioned absolutely at the bottom */}
            <XStack className="flex-shrink-0 items-center justify-between gap-4 px-6" style={{ bottom }}>
              {source === 'builtIn' && (
                <Button variant="ghost" isIconOnly onPress={handleAddAssistant}>
                  <Button.Label>
                    <UnionPlusIcon size={30} />
                  </Button.Label>
                </Button>
              )}
              {source === 'external' && (
                <Button variant="ghost" isIconOnly onPress={handleEditAssistant}>
                  <Button.Label>
                    <Settings2 size={30} />
                  </Button.Label>
                </Button>
              )}
              <Button
                className="flex-1 rounded-[30px] border-green-20 bg-green-10 px-5 py-2.5 dark:border-green-dark-20 dark:bg-green-dark-10"
                onPress={actionButton?.onPress || handleChatPress}>
                <Button.Label>
                  <Text className="text-[17px] font-bold text-green-100 dark:text-green-dark-100">
                    {actionButton?.text || t('assistants.market.button.chat')}
                  </Text>
                </Button.Label>
              </Button>
            </XStack>
          </YStack>
        )}
      </BottomSheetModal>
    )
  }
)

AssistantItemSheet.displayName = 'AssistantItemSheet'

export default AssistantItemSheet

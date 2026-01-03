import React from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, Pressable } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { ModelIcon } from '@/componentsV2/icons'
import { AtSign } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import type { Assistant, Model } from '@/types/assistant'
import { getBaseModelName } from '@/utils/naming'

import { presentModelSheet } from '../../../Sheet/ModelSheet'
import { handleModelChange } from '../services'

interface MentionButtonProps {
  mentions: Model[]
  setMentions: (mentions: Model[]) => void
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

const BUTTON_STYLES = {
  maxWidth: 150,
  container: 'gap-1 items-center message-input-container rounded-xl border-[0.5px] py-1 px-1',
  text: 'primary-text'
}

const DISPLAY_CONSTANTS = {
  ICON_SIZE: 20,
  MODEL_ICON_SIZE: 20,
  MAX_VISIBLE_MODELS: 3
} as const

export const MentionButton: React.FC<MentionButtonProps> = ({ mentions, setMentions, assistant, updateAssistant }) => {
  const { t } = useTranslation()

  // Use service for model change logic
  const onMentionChange = async (models: Model[]) => {
    setMentions(models)
    await handleModelChange(models, assistant, updateAssistant)
  }

  const handlePress = () => {
    Keyboard.dismiss()
    presentModelSheet({
      mentions,
      setMentions: onMentionChange,
      multiple: true
    })
  }

  const renderEmptyState = () => <AtSign size={DISPLAY_CONSTANTS.ICON_SIZE} />

  const renderSingleModel = (model: Model) => (
    <XStack className={`${BUTTON_STYLES.container} justify-center`}>
      <ModelIcon model={model} size={DISPLAY_CONSTANTS.MODEL_ICON_SIZE} />
      <Text className={`max-w-28 ${BUTTON_STYLES.text}`} numberOfLines={1} ellipsizeMode="middle">
        {getBaseModelName(model.name)}
      </Text>
    </XStack>
  )

  const renderMultipleModels = () => (
    <XStack className={`${BUTTON_STYLES.container} justify-center`}>
      {mentions.slice(0, DISPLAY_CONSTANTS.MAX_VISIBLE_MODELS).map((mention, index) => (
        <ModelIcon key={index} model={mention} size={DISPLAY_CONSTANTS.MODEL_ICON_SIZE} />
      ))}
      <Text className={BUTTON_STYLES.text}>{t('inputs.mentions', { number: mentions.length })}</Text>
    </XStack>
  )

  const renderButtonContent = () => {
    if (mentions.length === 0) return renderEmptyState()
    if (mentions.length === 1) return renderSingleModel(mentions[0])
    return renderMultipleModels()
  }

  return (
    <Pressable
      style={({ pressed }) => ({ maxWidth: BUTTON_STYLES.maxWidth, opacity: pressed ? 0.7 : 1 })}
      onPress={handlePress}
      hitSlop={5}>
      {renderButtonContent()}
    </Pressable>
  )
}

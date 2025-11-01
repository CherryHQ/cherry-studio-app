import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import React, { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, TouchableOpacity } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { ModelIcon } from '@/componentsV2/icons'
import { AtSign } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import type { Assistant, Model } from '@/types/assistant'
import { getBaseModelName } from '@/utils/naming'

import ModelSheet from '../../Sheet/ModelSheet'

interface MentionButtonProps {
  mentions: Model[]
  setMentions: (mentions: Model[]) => void
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

const BUTTON_STYLES = {
  maxWidth: 150,
  container:
    'gap-1 items-center bg-green-10 dark:bg-green-dark-10 rounded-[48px] border-green-20 dark:border-green-dark-20 border-[0.5px] py-1 px-1',
  text: 'text-green-100 dark:text-green-dark-100'
}

const DISPLAY_CONSTANTS = {
  ICON_SIZE: 20,
  MODEL_ICON_SIZE: 20,
  MAX_VISIBLE_MODELS: 3
} as const

export const MentionButton: React.FC<MentionButtonProps> = ({ mentions, setMentions, assistant, updateAssistant }) => {
  const { t } = useTranslation()
  const bottomSheetModalRef = useRef<BottomSheetModal>(null)

  const handlePress = () => {
    Keyboard.dismiss()
    bottomSheetModalRef.current?.present()
  }
  /**
   * @description Change Model Event
   * 1. Assistant没有defaultModel时，选择模型后设定defaultModel和model，如果为多选，则设置第一个模型为defaultModel
   * 2. Assistant有defaultModel时，选择模型后修改model，如果为多选，则设置第一个模型为model
   * @param models
   * @returns
   */
  const handleModelChange = async (models: Model[]) => {
    setMentions(models)

    let updatedAssistant: Assistant = assistant
    if (assistant.defaultModel) {
      updatedAssistant.model = models[0]
    } else {
      updatedAssistant.defaultModel = models[0]
      updatedAssistant.model = models[0]
    }

    await updateAssistant(updatedAssistant)
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
    <>
      <TouchableOpacity style={{ maxWidth: BUTTON_STYLES.maxWidth }} onPress={handlePress} hitSlop={5}>
        {renderButtonContent()}
      </TouchableOpacity>

      <ModelSheet ref={bottomSheetModalRef} mentions={mentions} setMentions={handleModelChange} multiple={true} />
    </>
  )
}

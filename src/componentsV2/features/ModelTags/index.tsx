import React from 'react'
import { useTranslation } from 'react-i18next'

import { CustomTag } from '@/componentsV2/base/CustomTag'
import { CircleDollarSign, Eye, Globe, Languages, Lightbulb, Repeat2, Wrench } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import {
  isEmbeddingModel,
  isFreeModel,
  isFunctionCallingModel,
  isReasoningModel,
  isRerankModel,
  isVisionModel,
  isWebSearchModel
} from '@/config/models'
import type { Model } from '@/types/assistant'

interface ModelTagsProps {
  model: Model
  showFree?: boolean
  showReasoning?: boolean
  showToolsCalling?: boolean
  size?: number
}

export const ModelTags: React.FC<ModelTagsProps> = ({
  model,
  showFree = true,
  showReasoning = true,
  showToolsCalling = true,
  size = 12
}) => {
  const { t } = useTranslation()

  const getTags = (
    model: Model,
    showFree: boolean,
    showReasoning: boolean,
    showToolsCalling: boolean,
    size: number
  ) => {
    const result: {
      key: string
      backgroundClassName: string
      textClassName: string
      icon: React.JSX.Element
      label: string
    }[] = []

    if (isVisionModel(model)) {
      result.push({
        key: 'vision',
        backgroundClassName: 'bg-green-20 dark:bg-green-dark-20',
        textClassName: 'text-green-100 dark:text-green-dark-100',
        icon: <Eye size={size} className="text-green-100 dark:text-green-dark-100" />,
        label: t('models.type.vision')
      })
    }

    if (isWebSearchModel(model)) {
      result.push({
        key: 'websearch',
        backgroundClassName: 'bg-blue-20 dark:bg-blue-dark-20',
        textClassName: 'text-blue-100 dark:text-blue-dark-100',
        icon: <Globe size={size} className="text-blue-100 dark:text-blue-dark-100" />,
        label: t('models.type.websearch')
      })
    }

    if (showReasoning && isReasoningModel(model)) {
      result.push({
        key: 'reasoning',
        backgroundClassName: 'bg-purple-20 dark:bg-purple-dark-20',
        textClassName: 'text-purple-100 dark:text-purple-dark-100',
        icon: <Lightbulb size={size} className="text-purple-100 dark:text-purple-dark-100" />,
        label: t('models.type.reasoning')
      })
    }

    if (showToolsCalling && isFunctionCallingModel(model)) {
      result.push({
        key: 'function_calling',
        backgroundClassName: 'bg-orange-20 dark:bg-orange-dark-20',
        textClassName: 'text-orange-100 dark:text-orange-dark-100',
        icon: <Wrench size={size} className="text-orange-100 dark:text-orange-dark-100" />,
        label: t('models.type.function_calling')
      })
    }

    // color need to be replace
    if (isEmbeddingModel(model)) {
      result.push({
        key: 'embedding',
        backgroundClassName: 'bg-purple-20 dark:bg-purple-dark-20',
        textClassName: 'text-purple-100 dark:text-purple-dark-100',
        icon: <Languages size={size} className="text-purple-100 dark:text-purple-dark-100" />,
        label: t('models.type.embedding')
      })
    }

    if (showFree && isFreeModel(model)) {
      result.push({
        key: 'free',
        backgroundClassName: 'bg-yellow-20 dark:bg-yellow-dark-20',
        textClassName: 'text-yellow-100 dark:text-yellow-dark-100',
        icon: <CircleDollarSign size={size} className="text-yellow-100 dark:text-yellow-dark-100" />,
        label: t('models.type.free')
      })
    }

    if (isRerankModel(model)) {
      result.push({
        key: 'rerank',
        backgroundClassName: 'bg-pink-20 dark:bg-pink-dark-20',
        textClassName: 'text-pink-100 dark:text-pink-dark-100',
        icon: <Repeat2 size={size} className="text-pink-100 dark:text-pink-dark-100" />,
        label: t('models.type.rerank')
      })
    }

    return result
  }

  const tags = getTags(model, showFree, showReasoning, showToolsCalling, size)

  if (tags.length === 0) {
    return null
  }

  return (
    <XStack className="items-center gap-4">
      {tags.map(tag => (
        <CustomTag
          key={tag.key}
          size={size}
          icon={tag.icon}
          backgroundClassName={tag.backgroundClassName}
          textClassName={tag.textClassName}>
          {tag.icon ? null : tag.label}
        </CustomTag>
      ))}
    </XStack>
  )
}

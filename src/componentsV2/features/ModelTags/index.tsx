import { cn } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Text from '@/componentsV2/base/Text'
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

type VisibilityOptions = {
  model: Model
  showFree: boolean
  showReasoning: boolean
  showToolsCalling: boolean
}

type TagDefinition = {
  key: string
  labelKey: string
  backgroundClassName: string
  textClassName: string
  renderIcon?: (size: number) => React.JSX.Element
  isVisible: (options: VisibilityOptions) => boolean
}

const TAG_DEFINITIONS: TagDefinition[] = [
  {
    key: 'vision',
    labelKey: 'models.type.vision',
    backgroundClassName: 'primary-container',
    textClassName: 'primary-text',
    renderIcon: size => <Eye size={size} className="primary-text" />,
    isVisible: ({ model }) => isVisionModel(model)
  },
  {
    key: 'websearch',
    labelKey: 'models.type.websearch',
    backgroundClassName: 'bg-sky-500/20',
    textClassName: 'text-sky-500',
    renderIcon: size => <Globe size={size} className="text-sky-500" />,
    isVisible: ({ model }) => isWebSearchModel(model)
  },
  {
    key: 'reasoning',
    labelKey: 'models.type.reasoning',
    backgroundClassName: 'bg-violet-600/20',
    textClassName: 'text-violet-600',
    renderIcon: size => <Lightbulb size={size} className="text-violet-600" />,
    isVisible: ({ model, showReasoning }) => showReasoning && isReasoningModel(model)
  },
  {
    key: 'function_calling',
    labelKey: 'models.type.function_calling',
    backgroundClassName: 'bg-orange-400/20',
    textClassName: 'text-orange-400',
    renderIcon: size => <Wrench size={size} className="text-orange-400" />,
    isVisible: ({ model, showToolsCalling }) => showToolsCalling && isFunctionCallingModel(model)
  },
  {
    key: 'embedding',
    labelKey: 'models.type.embedding',
    backgroundClassName: 'bg-violet-600/20',
    textClassName: 'text-violet-600',
    renderIcon: size => <Languages size={size} className="text-violet-600" />,
    isVisible: ({ model }) => isEmbeddingModel(model)
  },
  {
    key: 'free',
    labelKey: 'models.type.free',
    backgroundClassName: 'bg-yellow-400/20',
    textClassName: 'text-yellow-400',
    renderIcon: size => <CircleDollarSign size={size} className="text-yellow-400" />,
    isVisible: ({ model, showFree }) => showFree && isFreeModel(model)
  },
  {
    key: 'rerank',
    labelKey: 'models.type.rerank',
    backgroundClassName: 'bg-pink-500/20',
    textClassName: 'text-pink-500',
    renderIcon: size => <Repeat2 size={size} className="text-pink-500" />,
    isVisible: ({ model }) => isRerankModel(model)
  }
]

interface TagBadgeProps {
  icon?: React.ReactNode
  label?: string
  size: number
  backgroundClassName: string
  textClassName: string
}

const TagBadge: React.FC<TagBadgeProps> = ({ icon, label, size, backgroundClassName, textClassName }) => {
  const fontSize = Math.max(size - 2, 10)
  const paddingHorizontal = Math.max(size / 3, 4)
  const borderRadius = size / 2

  return (
    <XStack
      className={cn('items-center gap-1', backgroundClassName)}
      style={{
        borderRadius,
        paddingHorizontal,
        paddingVertical: 2
      }}>
      {icon}
      {label ? (
        <Text className={cn('text-foreground font-medium', textClassName)} style={{ fontSize }} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </XStack>
  )
}

export const ModelTags: React.FC<ModelTagsProps> = ({
  model,
  showFree = true,
  showReasoning = true,
  showToolsCalling = true,
  size = 12
}) => {
  const { t } = useTranslation()
  const tags = TAG_DEFINITIONS.filter(definition =>
    definition.isVisible({ model, showFree, showReasoning, showToolsCalling })
  ).map(definition => {
    const icon = definition.renderIcon?.(size)
    const label = icon ? undefined : t(definition.labelKey)

    return {
      key: definition.key,
      backgroundClassName: definition.backgroundClassName,
      textClassName: definition.textClassName,
      icon,
      label
    }
  })

  if (tags.length === 0) {
    return null
  }

  return (
    <XStack className="items-center gap-2">
      {tags.map(tag => (
        <TagBadge
          key={tag.key}
          icon={tag.icon}
          label={tag.label}
          size={size}
          backgroundClassName={tag.backgroundClassName}
          textClassName={tag.textClassName}
        />
      ))}
    </XStack>
  )
}

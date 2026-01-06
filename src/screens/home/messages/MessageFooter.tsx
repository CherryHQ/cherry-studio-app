import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import { IconButton, SelectionDropdown, Text, XStack } from '@/componentsV2'
import type { SelectionDropdownItem } from '@/componentsV2/base/SelectionDropdown'
import { TranslatedIcon, TranslationIcon } from '@/componentsV2/icons'
import {
  AudioLines,
  CirclePause,
  Copy,
  MoreHorizontal,
  PenLine,
  RefreshCw,
  Share,
  ThumbsUp,
  Trash2
} from '@/componentsV2/icons/LucideIcon'
import { useMessageActions } from '@/hooks/useMessageActions'
import type { Assistant } from '@/types/assistant'
import type { Message } from '@/types/message'

// 定义可用的按钮类型和位置
type FooterButtonType = 'copy' | 'regenerate' | 'play' | 'thumbsUp' | 'share' | 'edit' | 'translate' | 'delete'
type ButtonPosition = 'primary' | 'more'

interface ButtonConfig {
  type: FooterButtonType
  position: ButtonPosition
}

// 按角色配置显示的按钮及其位置
const FOOTER_BUTTONS_CONFIG: Record<'user' | 'assistant', ButtonConfig[]> = {
  user: [
    { type: 'copy', position: 'primary' },
    { type: 'regenerate', position: 'primary' },
    { type: 'edit', position: 'primary' },
    { type: 'delete', position: 'more' }
  ],
  assistant: [
    { type: 'copy', position: 'primary' },
    { type: 'regenerate', position: 'primary' },
    { type: 'play', position: 'primary' },
    { type: 'thumbsUp', position: 'primary' },
    { type: 'share', position: 'primary' },
    { type: 'edit', position: 'more' },
    { type: 'translate', position: 'more' },
    { type: 'delete', position: 'more' }
  ]
}

interface MessageFooterProps {
  assistant: Assistant
  message: Message
  isMultiModel?: boolean
}

const MessageFooter = ({ message, assistant, isMultiModel = false }: MessageFooterProps) => {
  const {
    isTranslated,
    playState,
    handleCopy,
    handleRegenerate,
    handlePlay,
    handleBestAnswer,
    handleDeleteTranslation,
    handleTranslate,
    handleDelete,
    handleShare,
    handleEdit
  } = useMessageActions({
    message,
    assistant
  })

  const { t } = useTranslation()

  const inputTokens = message.usage?.prompt_tokens
  const outputTokens = message.usage?.completion_tokens ?? message.metrics?.completion_tokens
  const derivedTotal =
    inputTokens === undefined && outputTokens === undefined ? undefined : (inputTokens ?? 0) + (outputTokens ?? 0)
  const totalTokens = message.usage?.total_tokens ?? derivedTotal
  const hasUsage = inputTokens !== undefined || outputTokens !== undefined || totalTokens !== undefined
  const formatTokens = (value?: number) => (typeof value === 'number' ? value.toLocaleString() : '--')

  const getAudioIcon = () => {
    switch (playState) {
      case 'playing':
        return <CirclePause size={18} className="text-foreground-secondary" />
      default:
        return <AudioLines size={18} className="text-foreground-secondary" />
    }
  }

  // 获取当前角色的按钮配置
  const role = message.role === 'user' ? 'user' : 'assistant'
  const buttonConfigs = FOOTER_BUTTONS_CONFIG[role]
  const hasButton = (button: FooterButtonType, position: ButtonPosition) =>
    buttonConfigs.some(config => config.type === button && config.position === position)

  // 构建 more 菜单项（仅包含配置中 position 为 'more' 的按钮）
  const moreItems: SelectionDropdownItem[] = []

  if (hasButton('edit', 'more')) {
    moreItems.push({
      id: 'edit',
      label: t('common.edit'),
      icon: <PenLine size={18} />,
      iOSIcon: 'pencil',
      onSelect: handleEdit
    })
  }

  if (hasButton('translate', 'more')) {
    moreItems.push({
      id: 'translate',
      label: isTranslated ? t('common.delete_translation') : t('message.translate_message'),
      icon: isTranslated ? <TranslatedIcon size={18} /> : <TranslationIcon size={18} />,
      iOSIcon: 'translate',
      onSelect: isTranslated ? handleDeleteTranslation : handleTranslate
    })
  }

  if (hasButton('delete', 'more')) {
    moreItems.push({
      id: 'delete',
      label: t('message.delete_message'),
      icon: <Trash2 size={18} />,
      iOSIcon: 'trash',
      destructive: true,
      onSelect: handleDelete
    })
  }

  const hasMoreItems = moreItems.length > 0

  return (
    <View className="justify-center px-5">
      <XStack className="items-center justify-between gap-5">
        <XStack className="gap-5">
          {hasButton('copy', 'primary') && (
            <IconButton icon={<Copy size={18} className="text-foreground-secondary" />} onPress={handleCopy} />
          )}
          {hasButton('regenerate', 'primary') && (
            <IconButton
              icon={<RefreshCw size={18} className="text-foreground-secondary" />}
              onPress={handleRegenerate}
            />
          )}
          {hasButton('edit', 'primary') && (
            <IconButton icon={<PenLine size={18} className="text-foreground-secondary" />} onPress={handleEdit} />
          )}

          {hasButton('play', 'primary') && <IconButton icon={getAudioIcon()} onPress={handlePlay} />}
          {hasButton('thumbsUp', 'primary') && message.role === 'assistant' && isMultiModel && (
            <IconButton
              icon={
                message.useful ? (
                  <ThumbsUp size={18} className="text-green-600" />
                ) : (
                  <ThumbsUp size={18} className="text-foreground-secondary" />
                )
              }
              onPress={handleBestAnswer}
            />
          )}
          {hasButton('share', 'primary') && (
            <IconButton icon={<Share size={18} className="text-foreground-secondary" />} onPress={handleShare} />
          )}
          {hasMoreItems && (
            <SelectionDropdown items={moreItems}>
              <Pressable>
                <MoreHorizontal size={18} className="text-foreground-secondary" />
              </Pressable>
            </SelectionDropdown>
          )}
        </XStack>

        {hasUsage && (
          <XStack className="items-center gap-1">
            <Text className="text-foreground-secondary text-[11px]">↑{formatTokens(inputTokens)}</Text>
            <Text className="text-foreground-secondary text-[11px]">↓{formatTokens(outputTokens)}</Text>
            <Text className="text-foreground-secondary text-[11px]">Σ{formatTokens(totalTokens)}</Text>
          </XStack>
        )}
      </XStack>
    </View>
  )
}

export default MessageFooter

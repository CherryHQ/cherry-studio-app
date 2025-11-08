import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import React, { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { IconButton, SelectionSheet, Text, XStack } from '@/componentsV2'
import { TranslatedIcon, TranslationIcon } from '@/componentsV2/icons'
import {
  AudioLines,
  CirclePause,
  Copy,
  MoreHorizontal,
  RefreshCw,
  Share,
  ThumbsUp,
  Trash2
} from '@/componentsV2/icons/LucideIcon'
import { useMessageActions } from '@/hooks/useMessageActions'
import type { Assistant } from '@/types/assistant'
import type { Message } from '@/types/message'

interface MessageFooterProps {
  assistant: Assistant
  message: Message
  isMultiModel?: boolean
}

const MessageFooter = ({ message, assistant, isMultiModel = false }: MessageFooterProps) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null)
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
    handleShare
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

  const moreItems = [
    {
      id: 'translate',
      label: isTranslated ? t('common.delete_translation') : t('message.translate_message'),
      icon: isTranslated ? (
        <TranslatedIcon size={18} color={isTranslated ? 'red' : undefined} />
      ) : (
        <TranslationIcon size={18} />
      ),
      color: isTranslated ? 'text-red-100' : undefined,
      backgroundColor: isTranslated ? 'bg-red-20' : undefined,
      onSelect: isTranslated ? handleDeleteTranslation : handleTranslate
    },
    {
      id: 'delete',
      label: t('message.delete_message'),
      icon: <Trash2 size={18} className="text-red-100" />,
      color: 'text-red-100',
      backgroundColor: 'bg-red-20',
      onSelect: handleDelete
    }
  ]

  const getAudioIcon = () => {
    switch (playState) {
      case 'playing':
        return <CirclePause size={18} className="text-text-secondary" />
      default:
        return <AudioLines size={18} className="text-text-secondary" />
    }
  }
  return (
    <View className="px-5 pb-5">
      <XStack className="items-center justify-between gap-5">
        <XStack className="gap-5">
          <IconButton icon={<Copy size={18} className="text-text-secondary" />} onPress={handleCopy} />
          <IconButton icon={<RefreshCw size={18} className="text-text-secondary" />} onPress={handleRegenerate} />

          <IconButton icon={getAudioIcon()} onPress={handlePlay} />
          {message.role === 'assistant' && isMultiModel && (
            <IconButton
              icon={
                message.useful ? (
                  <ThumbsUp size={18} className="text-green-600" />
                ) : (
                  <ThumbsUp size={18} className="text-text-secondary" />
                )
              }
              onPress={handleBestAnswer}
            />
          )}
          <IconButton icon={<Share size={18} className="text-text-secondary" />} onPress={handleShare} />
          <IconButton
            icon={<MoreHorizontal size={18} className="text-text-secondary" />}
            onPress={() => {
              bottomSheetModalRef.current?.present()
            }}
          />
        </XStack>

        {hasUsage && (
          <XStack className="items-center gap-1">
            <Text className="text-text-secondary text-[11px]">↑{formatTokens(inputTokens)}</Text>
            <Text className="text-text-secondary text-[11px]">↓{formatTokens(outputTokens)}</Text>
            <Text className="text-text-secondary text-[11px]">Σ{formatTokens(totalTokens)}</Text>
          </XStack>
        )}
      </XStack>

      <SelectionSheet ref={bottomSheetModalRef} items={moreItems} />
    </View>
  )
}

export default MessageFooter

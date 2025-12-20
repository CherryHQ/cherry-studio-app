import { useNavigation } from '@react-navigation/native'
import type { FC } from 'react'
import React, { useEffect, useRef, useState } from 'react'
import ContentLoader, { Rect } from 'react-content-loader/native'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import ContextMenu, { type ContextMenuListProps } from '@/componentsV2/base/ContextMenu'
import { presentDialog } from '@/componentsV2/base/Dialog/useDialogManager'
import Text from '@/componentsV2/base/Text'
import EmojiAvatar from '@/componentsV2/features/Assistant/EmojiAvatar'
import { ExportOptionsContent } from '@/componentsV2/features/TopicItem/ExportOptionsContent'
import { RenameTopicContent } from '@/componentsV2/features/TopicItem/RenameTopicContent'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useAssistant } from '@/hooks/useAssistant'
import { useExport } from '@/hooks/useExport'
import { useTheme } from '@/hooks/useTheme'
import { useToast } from '@/hooks/useToast'
import i18n from '@/i18n'
import { fetchTopicNaming } from '@/services/ApiService'
import type { Topic } from '@/types/assistant'
import type { HomeNavigationProps } from '@/types/naviagate'
import { storage } from '@/utils'

import { Check, CheckSquare, Download, Edit3, Sparkles, Trash2 } from '../../icons/LucideIcon'

type TimeFormat = 'time' | 'date'

// 话题名称骨架屏组件
const TopicNameSkeleton: FC<{ isDark: boolean }> = ({ isDark }) => {
  return (
    <View style={{ width: '100%' }}>
      <ContentLoader
        height={13}
        width="100%"
        speed={1.5}
        backgroundColor={isDark ? '#333' : '#f0f0f0'}
        foregroundColor={isDark ? '#555' : '#e0e0e0'}
        preserveAspectRatio="none"
        viewBox="0 0 100 13">
        <Rect x="0" y="0" rx="2" ry="2" width="100%" height="13" />
      </ContentLoader>
    </View>
  )
}

interface TopicItemProps {
  topic: Topic
  timeFormat?: TimeFormat
  onDelete?: (topicId: string) => Promise<void>
  onRename?: (topicId: string, newName: string) => Promise<void>
  currentTopicId: string
  switchTopic: (topicId: string) => Promise<void>
  handleNavigateChatScreen?: (topicId: string) => void
  isMultiSelectMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (topicId: string) => void
  onEnterMultiSelectMode?: (topicId: string) => void
}

export const TopicItem: FC<TopicItemProps> = ({
  topic,
  timeFormat = 'time',
  onDelete,
  onRename,
  currentTopicId,
  switchTopic,
  handleNavigateChatScreen,
  isMultiSelectMode = false,
  isSelected = false,
  onToggleSelect,
  onEnterMultiSelectMode
}) => {
  const { t } = useTranslation()
  const [currentLanguage, setCurrentLanguage] = useState<string>(i18n.language)
  const navigation = useNavigation<HomeNavigationProps>()
  const { assistant } = useAssistant(topic.assistantId)
  const [isGeneratingName, setIsGeneratingName] = useState(false)
  const { isDark } = useTheme()
  const isActive = currentTopicId === topic.id
  const toast = useToast()
  const { exportTopic } = useExport()

  const openTopic = () => {
    if (handleNavigateChatScreen) {
      handleNavigateChatScreen(topic.id)
    } else {
      navigation.navigate('ChatScreen', { topicId: topic.id })
    }
    switchTopic(topic.id).catch(console.error)
  }

  const handleTopicPress = () => {
    if (isMultiSelectMode) {
      onToggleSelect?.(topic.id)
      return
    }
    openTopic()
  }

  const date = new Date(topic.updatedAt)
  const displayTime =
    timeFormat === 'date'
      ? date.toLocaleDateString(currentLanguage, {
          month: 'short',
          day: 'numeric'
        })
      : date.toLocaleTimeString(currentLanguage, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })

  useEffect(() => {
    const fetchCurrentLanguage = () => {
      const storedLanguage = storage.getString('language')

      if (storedLanguage) {
        setCurrentLanguage(storedLanguage)
      }
    }

    fetchCurrentLanguage()
  }, [])

  const tempNameRef = useRef(topic.name)
  const exportOptionsRef = useRef({ includeReasoning: false })

  const handleExport = () => {
    exportOptionsRef.current = { includeReasoning: false }
    presentDialog('success', {
      title: t('export.options.title'),
      content: <ExportOptionsContent optionsRef={exportOptionsRef} />,
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      showCancel: true,
      onConfirm: () => {
        exportTopic(topic, exportOptionsRef.current)
      }
    })
  }

  const handleRename = () => {
    tempNameRef.current = topic.name
    presentDialog('info', {
      title: t('topics.rename.title'),
      content: <RenameTopicContent defaultValue={topic.name} nameRef={tempNameRef} />,
      confirmText: t('common.save'),
      cancelText: t('common.cancel'),
      showCancel: true,
      onConfirm: () => {
        handleSaveRename(tempNameRef.current)
      }
    })
  }

  const handleGenerateName = async () => {
    try {
      setIsGeneratingName(true)
      await fetchTopicNaming(topic.id, true)
    } catch (error) {
      toast.show(t('common.error_occurred' + '\n' + (error as Error)?.message), { color: '$red100', duration: 2500 })
    } finally {
      setIsGeneratingName(false)
    }
  }

  const handleSaveRename = (newName: string) => {
    if (newName && newName.trim() && newName.trim() !== topic.name) {
      try {
        onRename?.(topic.id, newName.trim())
      } catch (error) {
        presentDialog('error', {
          title: t('common.error_occurred'),
          content: (error as Error).message || 'Unknown error'
        })
      }
    }
  }

  const contextMenuItems: ContextMenuListProps[] = [
    ...(!isMultiSelectMode && onEnterMultiSelectMode
      ? [
          {
            title: t('topics.multi_select.action'),
            iOSIcon: 'checkmark.circle',
            androidIcon: <CheckSquare size={16} className="text-foreground" />,
            onSelect: () => onEnterMultiSelectMode(topic.id)
          }
        ]
      : []),
    {
      title: t('button.generate_topic_name'),
      iOSIcon: 'sparkles',
      androidIcon: <Sparkles size={16} className="text-foreground" />,
      onSelect: handleGenerateName
    },
    {
      title: t('button.rename_topic_name'),
      iOSIcon: 'rectangle.and.pencil.and.ellipsis',
      androidIcon: <Edit3 size={16} className="text-foreground" />,
      onSelect: handleRename
    },
    {
      title: t('export.md.label'),
      iOSIcon: 'arrow.down.doc',
      androidIcon: <Download size={16} className="text-foreground" />,
      onSelect: handleExport
    },
    {
      title: t('common.delete'),
      iOSIcon: 'trash',
      androidIcon: <Trash2 size={16} className="text-red-500" />,
      destructive: true,
      color: 'red',
      onSelect: () => onDelete?.(topic.id)
    }
  ]

  return (
    <ContextMenu
      borderRadius={16}
      list={contextMenuItems}
      onPress={handleTopicPress}
      disableContextMenu={isMultiSelectMode}>
      <XStack
        className={`items-center justify-center gap-1.5 rounded-lg px-1 py-1 ${
          isActive ? 'secondary-container' : 'bg-transparent'
        }`}>
        {isMultiSelectMode && (
          <View className="border-foreground mr-1 h-6 w-6 items-center justify-center rounded-full border">
            {isSelected && <Check size={14} />}
          </View>
        )}
        <EmojiAvatar
          emoji={assistant?.emoji}
          size={42}
          borderRadius={16}
          borderWidth={3}
          borderColor={isDark ? '#333333' : '#f7f7f7'}
        />
        <YStack className="flex-1 gap-0.5">
          <XStack className="items-center justify-between gap-2">
            <Text className="flex-1 text-base font-bold" numberOfLines={1} ellipsizeMode="tail">
              {assistant?.name}
            </Text>
            <Text className="text-wrap-none text-foreground-secondary shrink-0 text-xs">{displayTime}</Text>
          </XStack>
          {isGeneratingName ? (
            <TopicNameSkeleton isDark={isDark} />
          ) : (
            <Text className="text-foreground-secondary text-[13px] font-normal" numberOfLines={1} ellipsizeMode="tail">
              {topic.name}
            </Text>
          )}
        </YStack>
      </XStack>
    </ContextMenu>
  )
}

import { useNavigation } from '@react-navigation/native'
import { useTheme } from 'heroui-native'
import type { FC } from 'react'
import React, { useEffect, useRef, useState } from 'react'
import ContentLoader, { Rect } from 'react-content-loader/native'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import ContextMenu from '@/componentsV2/base/ContextMenu'
import Text from '@/componentsV2/base/Text'
import TextField from '@/componentsV2/base/TextField'
import EmojiAvatar from '@/componentsV2/features/Assistant/EmojiAvatar'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useAssistant } from '@/hooks/useAssistant'
import { useDialog } from '@/hooks/useDialog'
import { useToast } from '@/hooks/useToast'
import i18n from '@/i18n'
import { fetchTopicNaming } from '@/services/ApiService'
import type { Topic } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'
import { storage } from '@/utils'

import { Edit3, Sparkles, Trash2 } from '../../icons/LucideIcon'

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
}

export const TopicItem: FC<TopicItemProps> = ({
  topic,
  timeFormat = 'time',
  onDelete,
  onRename,
  currentTopicId,
  switchTopic,
  handleNavigateChatScreen
}) => {
  const { t } = useTranslation()
  const [currentLanguage, setCurrentLanguage] = useState<string>(i18n.language)
  const navigation = useNavigation<DrawerNavigationProps>()
  const { assistant } = useAssistant(topic.assistantId)
  const [isGeneratingName, setIsGeneratingName] = useState(false)
  const dialog = useDialog()
  const { isDark } = useTheme()
  const isActive = currentTopicId === topic.id
  const toast = useToast()

  const openTopic = () => {
    if (handleNavigateChatScreen) {
      handleNavigateChatScreen(topic.id)
    } else {
      navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId: topic.id } })
    }
    switchTopic(topic.id).catch(console.error)
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

  const handleRename = () => {
    dialog.open({
      title: t('topics.rename.title'),
      confirmText: t('common.save'),
      cancelText: t('common.cancel'),
      content: (
        <TextField className="mt-2 w-full">
          <TextField.Input
            className="rounded-2xl bg-transparent"
            defaultValue={topic.name}
            onChangeText={value => {
              tempNameRef.current = value
            }}
            autoFocus
            placeholder={t('common.please_enter') || ''}
          />
        </TextField>
      ),
      onConFirm: () => {
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
        dialog.open({
          type: 'error',
          title: t('common.error_occurred'),
          content: (error as Error).message || 'Unknown error'
        })
      }
    }
  }

  return (
    <ContextMenu
      borderRadius={16}
      list={[
        {
          title: t('button.generate_topic_name'),
          iOSIcon: 'sparkles',
          androidIcon: <Sparkles size={16} className="text-text-primary dark:text-text-primary-dark" />,
          onSelect: handleGenerateName
        },
        {
          title: t('button.rename_topic_name'),
          iOSIcon: 'rectangle.and.pencil.and.ellipsis',
          androidIcon: <Edit3 size={16} className="text-text-primary dark:text-text-primary-dark" />,
          onSelect: handleRename
        },
        {
          title: t('common.delete'),
          iOSIcon: 'trash',
          androidIcon: <Trash2 size={16} className="text-red-500" />,
          destructive: true,
          color: 'red',
          onSelect: () => onDelete?.(topic.id)
        }
      ]}
      onPress={openTopic}>
      <XStack
        className={`items-center justify-center gap-1.5 rounded-lg px-1 py-1 ${
          isActive ? 'bg-green-10 dark:bg-green-10' : 'bg-transparent'
        }`}>
        <EmojiAvatar
          emoji={assistant?.emoji}
          size={42}
          borderRadius={16}
          borderWidth={3}
          borderColor={isDark ? '#444444' : '#ffffff'}
        />
        <YStack className="flex-1 gap-0.5">
          <XStack className="items-center justify-between gap-2">
            <Text className="flex-1 text-base font-bold" numberOfLines={1} ellipsizeMode="tail">
              {assistant?.name}
            </Text>
            <Text className="text-wrap-none shrink-0 text-xs text-text-secondary dark:text-text-secondary-dark">
              {displayTime}
            </Text>
          </XStack>
          {isGeneratingName ? (
            <TopicNameSkeleton isDark={isDark} />
          ) : (
            <Text
              className="text-[13px] font-normal text-text-secondary dark:text-text-secondary-dark"
              numberOfLines={1}
              ellipsizeMode="tail">
              {topic.name}
            </Text>
          )}
        </YStack>
      </XStack>
    </ContextMenu>
  )
}

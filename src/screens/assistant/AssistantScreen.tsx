import { DrawerActions, useNavigation } from '@react-navigation/native'
import { FlashList } from '@shopify/flash-list'
import { SymbolView } from 'expo-symbols'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  Container,
  DrawerGestureWrapper,
  HeaderBar,
  ListSkeleton,
  presentDialog,
  SafeAreaContainer,
  SearchInput,
  Text,
  XStack,
  YStack
} from '@/componentsV2'
import { LiquidGlassButton } from '@/componentsV2/base/LiquidGlassButton'
import AssistantItem from '@/componentsV2/features/Assistant/AssistantItem'
import { presentAssistantItemSheet } from '@/componentsV2/features/Assistant/AssistantItemSheet'
import { Menu, Plus, Trash2 } from '@/componentsV2/icons/LucideIcon'
import { useAssistants } from '@/hooks/useAssistant'
import { useSearch } from '@/hooks/useSearch'
import { useSkeletonLoading } from '@/hooks/useSkeletonLoading'
import { useToast } from '@/hooks/useToast'
import { getCurrentTopicId } from '@/hooks/useTopic'
import { assistantService, createAssistant, getDefaultAssistant } from '@/services/AssistantService'
import { loggerService } from '@/services/LoggerService'
import { topicService } from '@/services/TopicService'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'
import { isIOS } from '@/utils/device'

const logger = loggerService.withContext('AssistantScreen')

export default function AssistantScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()
  const toast = useToast()

  const { assistants, isLoading } = useAssistants()

  const { searchText, setSearchText, filteredItems } = useSearch(
    assistants,
    useCallback((assistant: Assistant) => [assistant.name, assistant.description || ''], []),
    { delay: 100 }
  )
  // Filter out translate and quick assistants
  const filteredAssistants = filteredItems.filter(assistant => assistant.id !== 'translate' && assistant.id !== 'quick')

  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const showSkeleton = useSkeletonLoading(isLoading)

  const selectionCount = selectedAssistantIds.length
  const hasSelection = selectionCount > 0

  const handleEditAssistant = (assistantId: string) => {
    navigation.navigate('Assistant', { screen: 'AssistantDetailScreen', params: { assistantId } })
  }

  const onChatNavigation = async (topicId: string) => {
    navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId } })
  }

  const handleAssistantItemPress = (assistant: Assistant) => {
    presentAssistantItemSheet({
      assistant,
      source: 'external',
      onEdit: handleEditAssistant,
      onChatNavigation
    })
  }

  const onAddAssistant = async () => {
    const newAssistant = await createAssistant()
    navigation.navigate('Assistant', { screen: 'AssistantDetailScreen', params: { assistantId: newAssistant.id } })
  }

  const handleMenuPress = () => {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  const handleEnterMultiSelectMode = useCallback((assistantId: string) => {
    setIsMultiSelectMode(true)
    setSelectedAssistantIds(prev => {
      if (prev.includes(assistantId)) {
        return prev
      }
      return [...prev, assistantId]
    })
  }, [])

  const handleToggleAssistantSelection = useCallback(
    (assistantId: string) => {
      if (!isMultiSelectMode) return
      setSelectedAssistantIds(prev => {
        if (prev.includes(assistantId)) {
          return prev.filter(id => id !== assistantId)
        }
        return [...prev, assistantId]
      })
    },
    [isMultiSelectMode]
  )

  const handleCancelMultiSelect = useCallback(() => {
    setIsMultiSelectMode(false)
    setSelectedAssistantIds([])
  }, [])

  const performBatchDelete = useCallback(async () => {
    if (!selectedAssistantIds.length) return
    setIsDeleting(true)
    const idsToDelete = [...selectedAssistantIds]

    try {
      const currentTopicId = getCurrentTopicId()

      // Check if any selected assistant owns the current topic
      let needsTopicSwitch = false
      for (const assistantId of idsToDelete) {
        const isOwner = await topicService.isTopicOwnedByAssistant(assistantId, currentTopicId)
        if (isOwner) {
          needsTopicSwitch = true
          break
        }
      }

      // If we need to switch topic, do it first
      if (needsTopicSwitch) {
        const defaultAssistant = await getDefaultAssistant()
        const newTopic = await topicService.createTopic(defaultAssistant)
        await topicService.switchToTopic(newTopic.id)
        navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId: newTopic.id } })
      }

      // Delete all selected assistants and their topics
      for (const assistantId of idsToDelete) {
        await topicService.deleteTopicsByAssistantId(assistantId)
        await assistantService.deleteAssistant(assistantId)
      }

      toast.show(t('assistants.multi_select.delete_success', { count: idsToDelete.length }))
      handleCancelMultiSelect()
    } catch (error) {
      logger.error('Error deleting assistants:', error)
      toast.show(t('message.error_deleting_assistant'))
    } finally {
      setIsDeleting(false)
    }
  }, [handleCancelMultiSelect, navigation, selectedAssistantIds, t, toast])

  const handleBatchDelete = useCallback(() => {
    if (!hasSelection || isDeleting) return
    presentDialog('error', {
      title: t('assistants.multi_select.delete_confirm_title', { count: selectionCount }),
      content: t('assistants.multi_select.delete_confirm_message', { count: selectionCount }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      showCancel: true,
      onConfirm: () => {
        void performBatchDelete()
      }
    })
  }, [hasSelection, isDeleting, performBatchDelete, selectionCount, t])

  return (
    <SafeAreaContainer className="pb-0">
      <DrawerGestureWrapper>
        <View collapsable={false} className="flex-1">
          {isMultiSelectMode ? (
            <HeaderBar
              title={t('assistants.multi_select.selected_count', { count: selectionCount })}
              showBackButton={false}
              rightButton={{
                icon: <Text className="text-base font-medium">{t('common.cancel')}</Text>,
                onPress: handleCancelMultiSelect
              }}
            />
          ) : (
            <HeaderBar
              title={t('assistants.title.mine')}
              leftButton={{
                icon: <Menu size={24} />,
                onPress: handleMenuPress
              }}
              rightButtons={[
                {
                  icon: <Plus size={24} />,
                  onPress: onAddAssistant
                }
              ]}
            />
          )}
          <Container className="p-0">
            <View className="px-4">
              <SearchInput
                placeholder={t('common.search_placeholder')}
                value={searchText}
                onChangeText={setSearchText}
              />
            </View>
            {showSkeleton ? (
              <ListSkeleton variant="card" count={10} />
            ) : (
              <FlashList
                showsVerticalScrollIndicator={false}
                data={filteredAssistants}
                extraData={{ isMultiSelectMode, selectedAssistantIds }}
                renderItem={({ item }) => (
                  <AssistantItem
                    assistant={item}
                    onAssistantPress={handleAssistantItemPress}
                    isMultiSelectMode={isMultiSelectMode}
                    isSelected={selectedAssistantIds.includes(item.id)}
                    onToggleSelection={handleToggleAssistantSelection}
                    onEnterMultiSelectMode={handleEnterMultiSelectMode}
                  />
                )}
                keyExtractor={item => item.id}
                ItemSeparatorComponent={() => <YStack className="h-2" />}
                ListEmptyComponent={
                  <YStack className="flex-1 items-center justify-center">
                    <Text>{t('settings.assistant.empty')}</Text>
                  </YStack>
                }
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
              />
            )}
          </Container>
          {isMultiSelectMode && (
            <View className="absolute bottom-0 left-0 right-0 px-5">
              <XStack className="items-center justify-end gap-2">
                <LiquidGlassButton size={40} onPress={handleBatchDelete}>
                  {isIOS ? <SymbolView name="trash" size={20} tintColor={'red'} /> : <Trash2 size={20} color="red" />}
                </LiquidGlassButton>
              </XStack>
            </View>
          )}
        </View>
      </DrawerGestureWrapper>
    </SafeAreaContainer>
  )
}

import { LegendList } from '@legendapp/list'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { useNavigation } from '@react-navigation/native'
import { Button, cn } from 'heroui-native'
import { sortBy } from 'lodash'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, InteractionManager, Platform, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SearchInput } from '@/componentsV2/base/SearchInput'
import Text from '@/componentsV2/base/Text'
import { ModelTags } from '@/componentsV2/features/ModelTags'
import { ModelIcon, ProviderIcon } from '@/componentsV2/icons'
import { BrushCleaning, Settings } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { isEmbeddingModel, isRerankModel } from '@/config/models'
import { useAllProviders } from '@/hooks/useProviders'
import { useTheme } from '@/hooks/useTheme'
import type { Model, Provider } from '@/types/assistant'
import type { HomeNavigationProps } from '@/types/naviagate'
import { getModelUniqId } from '@/utils/model'

import { EmptyModelView } from '../SettingsScreen/EmptyModelView'

interface ModelSheetProps {
  name: string
  mentions: Model[]
  setMentions: (mentions: Model[], isMultiSelectActive?: boolean) => Promise<void>
  multiple?: boolean
}

/**
 * Present the ModelSheet globally by name
 */
export const presentModelSheet = (name: string) => TrueSheet.present(name)

/**
 * Dismiss the ModelSheet globally by name
 */
export const dismissModelSheet = (name: string) => TrueSheet.dismiss(name)

function ModelSheet({ name, mentions, setMentions, multiple }: ModelSheetProps) {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const [selectedModels, setSelectedModels] = useState<string[]>(() => mentions.map(m => getModelUniqId(m)))
  const [searchQuery, setSearchQuery] = useState('')
  const [isMultiSelectActive, setIsMultiSelectActive] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<HomeNavigationProps>()

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text)
  }, [])

  useEffect(() => {
    setSelectedModels(mentions.map(m => getModelUniqId(m)))
  }, [mentions])

  useEffect(() => {
    if (!isVisible) {
      return
    }

    const backAction = () => {
      TrueSheet.dismiss(name)
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [name, isVisible])

  const { providers } = useAllProviders()
  const selectOptions = providers
    .filter(p => p.id === 'cherryai' || (p.models && p.models.length > 0 && p.enabled))
    .map(p => ({
      label: p.isSystem ? t(`provider.${p.id}`) : p.name,
      title: p.name,
      provider: p,
      options: sortBy(p.models, 'name')
        .filter(m => !isEmbeddingModel(m) && !isRerankModel(m))
        .filter(m => {
          if (!searchQuery) return true
          const query = searchQuery.toLowerCase()
          const modelId = getModelUniqId(m).toLowerCase()
          const modelName = m.name.toLowerCase()
          return modelId.includes(query) || modelName.includes(query)
        })
        .map(m => ({
          label: `${m.name}`,
          value: getModelUniqId(m),
          model: m
        }))
    }))
    .filter(group => group.options.length > 0)

  const allModelOptions = selectOptions.flatMap(group => group.options)

  // Build flattened list data for LegendList
  type ListItem =
    | { type: 'header'; label: string; provider: Provider }
    | { type: 'model'; label: string; value: string; model: Model }

  const listData = useMemo(() => {
    const items: ListItem[] = []
    selectOptions.forEach(group => {
      items.push({ type: 'header', label: group.label, provider: group.provider })
      group.options.forEach(opt => {
        items.push({ type: 'model', label: opt.label, value: opt.value, model: opt.model })
      })
    })
    return items
  }, [selectOptions])

  const handleModelToggle = async (modelValue: string) => {
    const isSelected = selectedModels.includes(modelValue)
    let newSelection: string[]

    if (isMultiSelectActive) {
      // 多选模式
      if (!isSelected) {
        newSelection = [...selectedModels, modelValue]
      } else {
        newSelection = selectedModels.filter(id => id !== modelValue)
      }
    } else {
      // 单选模式
      if (!isSelected) {
        newSelection = [modelValue] // 只保留当前选中的
      } else {
        newSelection = [] // 取消选中
      }

      TrueSheet.dismiss(name)
    }

    setSelectedModels(newSelection)

    const newMentions = allModelOptions
      .filter(option => newSelection.includes(option.value))
      .map(option => option.model)
    InteractionManager.runAfterInteractions(async () => {
      await setMentions(newMentions, isMultiSelectActive)
    })
  }

  const handleClearAll = async () => {
    setSelectedModels([])
    await setMentions([])
  }

  const toggleMultiSelectMode = async () => {
    const newMultiSelectActive = !isMultiSelectActive
    setIsMultiSelectActive(newMultiSelectActive)

    // 如果切换到单选模式且当前有多个选择，只保留第一个
    if (!newMultiSelectActive && selectedModels.length > 1) {
      const firstSelected = selectedModels[0]
      setSelectedModels([firstSelected])
      const newMentions = allModelOptions.filter(option => option.value === firstSelected).map(option => option.model)
      await setMentions(newMentions)
    }
  }

  const navigateToProvidersSetting = (provider: Provider) => {
    TrueSheet.dismiss(name)
    navigation.navigate('ProvidersSettings', { screen: 'ProviderSettingsScreen', params: { providerId: provider.id } })
  }

  const handleDidDismiss = () => {
    setIsVisible(false)
    setSearchQuery('')
  }

  const handleDidPresent = () => {
    setIsVisible(true)
  }

  const ESTIMATED_ITEM_SIZE = 60
  const DRAW_DISTANCE = 800

  const headerComponent = (
    <YStack className="gap-4 px-5 pb-2 pt-4">
      <XStack className="flex-1 items-center justify-center gap-[5px]">
        <YStack className="flex-1">
          <SearchInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder={t('common.search_placeholder')}
          />
        </YStack>
        {multiple && (
          <Button
            feedbackVariant="ripple"
            size="sm"
            className={`h-10 rounded-lg ${
              isMultiSelectActive ? 'border-green-20 bg-green-10 border' : 'bg-ui-card border border-transparent'
            }`}
            onPress={toggleMultiSelectMode}>
            <Button.Label>
              <Text className={isMultiSelectActive ? 'text-green-100' : 'text-text-primary'}>
                {t('button.multiple')}
              </Text>
            </Button.Label>
          </Button>
        )}
        {multiple && isMultiSelectActive && (
          <Button
            size="sm"
            feedbackVariant="ripple"
            className="bg-ui-card rounded-full"
            isIconOnly
            onPress={handleClearAll}>
            <Button.Label>
              <BrushCleaning size={18} className="text-text-primary" />
            </Button.Label>
          </Button>
        )}
      </XStack>
    </YStack>
  )

  return (
    <TrueSheet
      name={name}
      detents={[0.85]}
      cornerRadius={30}
      grabber
      dismissible
      dimmed
      keyboardMode="pan"
      scrollable
      header={headerComponent}
      onDidDismiss={handleDidDismiss}
      onDidPresent={handleDidPresent}>
      <View className="flex-1">
        <LegendList
          data={listData}
          extraData={{ selectedModels, isMultiSelectActive, searchQuery }}
          nestedScrollEnabled={Platform.OS === 'android'}
          renderItem={({ item, index }: { item: ListItem; index: number }) => {
            if (!item) return null
            if (item.type === 'header') {
              return (
                <TouchableOpacity
                  disabled
                  activeOpacity={1}
                  style={{
                    marginTop: index !== 0 ? 12 : 0,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  className="px-2">
                  <XStack className="items-center justify-start gap-3 px-0">
                    <XStack className="items-center justify-center">
                      <ProviderIcon provider={item.provider} size={24} />
                    </XStack>
                    <Text className="text-lg font-bold text-gray-400 ">{item.label.toUpperCase()}</Text>
                  </XStack>
                  {item.provider.id !== 'cherryai' && (
                    <TouchableOpacity onPress={() => navigateToProvidersSetting(item.provider)}>
                      <Settings className="text-gray-80" size={16} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              )
            }

            // model item
            const isSelected = selectedModels.includes(item.value)
            return (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleModelToggle(item.value)}
                className={`justify-between rounded-lg border px-2 ${
                  isSelected ? 'border-green-20 bg-green-10' : 'border-transparent bg-transparent'
                }`}>
                <XStack className="w-full items-center gap-2 py-1">
                  <XStack className="items-center justify-center">
                    <ModelIcon model={item.model} size={24} />
                  </XStack>
                  <YStack className="flex-1 gap-1">
                    <Text
                      className={cn('text-sm leading-none', isSelected ? 'text-green-100' : 'text-text-primary')}
                      numberOfLines={1}
                      ellipsizeMode="tail">
                      {item.label}
                    </Text>
                    <ModelTags model={item.model} size={11} />
                  </YStack>
                </XStack>
              </TouchableOpacity>
            )
          }}
          keyExtractor={(item, index) =>
            item?.type === 'header' ? `header-${(item as any).label}-${index}` : (item as any).value
          }
          getItemType={item => item?.type ?? 'model'}
          ItemSeparatorComponent={() => <YStack className="h-2" />}
          ListEmptyComponent={<EmptyModelView />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 20
          }}
          estimatedItemSize={ESTIMATED_ITEM_SIZE}
          drawDistance={DRAW_DISTANCE}
          recycleItems
        />
      </View>
    </TrueSheet>
  )
}

ModelSheet.displayName = 'MentionSheet'

export default ModelSheet

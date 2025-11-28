import { useNavigation } from '@react-navigation/native'
import { FlashList as ShopifyFlashList } from '@shopify/flash-list'
import { Button, cn } from 'heroui-native'
import { sortBy } from 'lodash'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InteractionManager, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import type { SheetProps } from 'react-native-actions-sheet'
import ActionSheet, { SheetManager } from 'react-native-actions-sheet'
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

interface ModelSheetPayload {
  mentions: Model[]
  setMentions: (mentions: Model[], isMultiSelectActive?: boolean) => Promise<void>
  multiple?: boolean
}

const ModelSheet = (props: SheetProps<'model-sheet'>) => {
  const { mentions, setMentions, multiple } = props.payload || {}
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const [selectedModels, setSelectedModels] = useState<string[]>(() => mentions?.map(m => getModelUniqId(m)) || [])
  const [searchQuery, setSearchQuery] = useState('')
  const [isMultiSelectActive, setIsMultiSelectActive] = useState(false)
  const insets = useSafeAreaInsets()
  const dimensions = useWindowDimensions()
  const navigation = useNavigation<HomeNavigationProps>()

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text)
  }, [])

  useEffect(() => {
    if (mentions) {
      setSelectedModels(mentions.map(m => getModelUniqId(m)))
    }
  }, [mentions])

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

  // Build flattened list data for FlashList
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
    if (!setMentions) return

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

      SheetManager.hide(props.sheetId)
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
    if (!setMentions) return
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
      if (setMentions) {
        await setMentions(newMentions)
      }
    }
  }

  const navigateToProvidersSetting = (provider: Provider) => {
    SheetManager.hide(props.sheetId)
    navigation.navigate('ProvidersSettings', { screen: 'ProviderSettingsScreen', params: { providerId: provider.id } })
  }

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
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
            alignItems: 'center',
            paddingHorizontal: 8,
            minHeight: 40
          }}>
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
        className={`mb-2 justify-between rounded-lg border px-2 ${
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
  }

  const ListHeaderComponent = (
    <YStack className="gap-4 px-5 py-4">
      <XStack className="items-center justify-center gap-2 ">
        <YStack className="flex-1">
          <SearchInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder={t('common.search_placeholder')}
          />
        </YStack>
        {multiple && (
          <Button
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
          <Button size="sm" className="bg-ui-card rounded-full" isIconOnly onPress={handleClearAll}>
            <Button.Label>
              <BrushCleaning size={18} className="text-text-primary" />
            </Button.Label>
          </Button>
        )}
      </XStack>
    </YStack>
  )

  return (
    <ActionSheet
      id={props.sheetId}
      useBottomSafeAreaPadding={false}
      containerStyle={{
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff',
        height: '85%'
      }}
      indicatorStyle={{
        backgroundColor: isDark ? '#f9f9f9ff' : '#202020ff'
      }}
      gestureEnabled={true}>
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        {ListHeaderComponent}
        <ShopifyFlashList
          data={listData}
          extraData={{ selectedModels, isMultiSelectActive, searchQuery }}
          renderItem={renderItem}
          getItemType={item => item.type}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 20
          }}
          ListEmptyComponent={<EmptyModelView />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    </ActionSheet>
  )
}

export default ModelSheet

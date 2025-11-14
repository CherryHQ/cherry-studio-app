import { BottomSheetBackdrop, BottomSheetModal, useBottomSheetScrollableCreator } from '@gorhom/bottom-sheet'
import { LegendList } from '@legendapp/list'
import { useNavigation } from '@react-navigation/native'
import { Button } from 'heroui-native'
import { sortBy } from 'lodash'
import React, { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, InteractionManager, TouchableOpacity, useWindowDimensions } from 'react-native'
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
  mentions: Model[]
  setMentions: (mentions: Model[], isMultiSelectActive?: boolean) => Promise<void>
  multiple?: boolean
}

const ModelSheet = forwardRef<BottomSheetModal, ModelSheetProps>(({ mentions, setMentions, multiple }, ref) => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const [selectedModels, setSelectedModels] = useState<string[]>(() => mentions.map(m => getModelUniqId(m)))
  const [searchQuery, setSearchQuery] = useState('')
  const [isMultiSelectActive, setIsMultiSelectActive] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const insets = useSafeAreaInsets()
  const dimensions = useWindowDimensions()
  const navigation = useNavigation<HomeNavigationProps>()

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text)
  }, [])

  useEffect(() => {
    setSelectedModels(mentions.map(m => getModelUniqId(m)))
  }, [mentions])

  useEffect(() => {
    if (!isVisible) {
      // 清空搜索状态
      setSearchQuery('')
      return
    }

    const backAction = () => {
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [ref, isVisible])

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

      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
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
    ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
    navigation.navigate('ProvidersSettings', { screen: 'ProviderSettingsScreen', params: { providerId: provider.id } })
  }

  // 添加背景组件渲染函数
  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
  )

  const BottomSheetLegendListScrollable = useBottomSheetScrollableCreator()

  const ESTIMATED_ITEM_SIZE = 60
  const DRAW_DISTANCE = 800

  return (
    <BottomSheetModal
      enableDynamicSizing={true}
      ref={ref}
      backgroundStyle={{
        borderRadius: 30,
        backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
      }}
      handleIndicatorStyle={{
        backgroundColor: isDark ? '#f9f9f9ff' : '#202020ff'
      }}
      backdropComponent={renderBackdrop}
      enablePanDownToClose={true}
      topInset={insets.top}
      android_keyboardInputMode="adjustResize"
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      enableDismissOnClose
      maxDynamicContentSize={dimensions.height - 2 * insets.top}
      onDismiss={() => setIsVisible(false)}
      onChange={index => setIsVisible(index >= 0)}>
      <LegendList
        data={listData}
        extraData={{ selectedModels, isMultiSelectActive, searchQuery }}
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
              className={`justify-between rounded-lg border px-2 py-2 ${
                isSelected ? 'border-green-20 bg-green-10' : 'border-transparent bg-transparent'
              }`}>
              <XStack className="w-full items-center justify-between gap-2">
                <XStack className="flex-1 items-center gap-2" style={{ minWidth: 0 }}>
                  <XStack className="shrink-0 items-center justify-center">
                    <ModelIcon model={item.model} size={24} />
                  </XStack>
                  <Text
                    className={isSelected ? 'text-green-100' : 'text-text-primary'}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={{ flex: 1, minWidth: 0 }}>
                    {item.label}
                  </Text>
                </XStack>
                <XStack className="shrink-0 items-center gap-2">
                  <ModelTags model={item.model} size={11} />
                </XStack>
              </XStack>
            </TouchableOpacity>
          )
        }}
        keyExtractor={(item, index) =>
          item?.type === 'header' ? `header-${(item as any).label}-${index}` : (item as any).value
        }
        getItemType={item => item?.type ?? 'model'}
        ItemSeparatorComponent={() => <YStack className="h-2" />}
        ListHeaderComponentStyle={{ minHeight: 50 }}
        ListHeaderComponent={
          <YStack className="gap-4" style={{ paddingTop: 4 }}>
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
                  size="sm"
                  className={`rounded-full ${
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
        }
        ListEmptyComponent={<EmptyModelView />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 20
        }}
        renderScrollComponent={BottomSheetLegendListScrollable}
        estimatedItemSize={ESTIMATED_ITEM_SIZE}
        drawDistance={DRAW_DISTANCE}
        recycleItems
      />
    </BottomSheetModal>
  )
})

ModelSheet.displayName = 'MentionSheet'

export default ModelSheet

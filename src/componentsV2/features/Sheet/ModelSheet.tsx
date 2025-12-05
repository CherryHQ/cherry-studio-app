import type { LegendListRef } from '@legendapp/list'
import { LegendList } from '@legendapp/list'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { useNavigation } from '@react-navigation/native'
import { Button, cn, Tabs } from 'heroui-native'
import { sortBy } from 'lodash'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NativeScrollEvent } from 'react-native'
import { BackHandler, InteractionManager, Platform, TouchableOpacity, useWindowDimensions, View } from 'react-native'

import { SearchInput } from '@/componentsV2/base/SearchInput'
import Text from '@/componentsV2/base/Text'
import { ModelTags } from '@/componentsV2/features/ModelTags'
import { ModelIcon, ProviderIcon } from '@/componentsV2/icons'
import { BrushCleaning, Settings } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { isEmbeddingModel, isRerankModel } from '@/config/models'
import { useBottom } from '@/hooks/useBottom'
import { useAllProviders } from '@/hooks/useProviders'
import { useTheme } from '@/hooks/useTheme'
import type { Model, Provider } from '@/types/assistant'
import type { HomeNavigationProps } from '@/types/naviagate'
import { isIOS } from '@/utils/device'
import { getModelUniqId } from '@/utils/model'

import { EmptyModelView } from '../SettingsScreen/EmptyModelView'

const SHEET_NAME = 'global-model-sheet'

// Provider Tab Bar 相关常量
const HEADER_HEIGHT = 80 // 搜索栏区域高度
const HEADER_ITEM_HEIGHT = 40 // provider header 高度
const MODEL_ITEM_HEIGHT = 48 // model 项高度
const SEPARATOR_HEIGHT = 8 // 分隔符高度
const GROUP_MARGIN_TOP = 12 // provider 组间距
const TAB_BAR_HEIGHT = 56 // 底部 tab 栏高度

interface ModelSheetData {
  mentions: Model[]
  setMentions: (mentions: Model[], isMultiSelectActive?: boolean) => Promise<void> | void
  multiple?: boolean
}

const defaultModelSheetData: ModelSheetData = {
  mentions: [],
  setMentions: async () => {},
  multiple: false
}

let currentSheetData: ModelSheetData = defaultModelSheetData
let updateSheetDataCallback: ((data: ModelSheetData) => void) | null = null

export const presentModelSheet = (data: ModelSheetData) => {
  currentSheetData = data
  updateSheetDataCallback?.(data)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissModelSheet = () => TrueSheet.dismiss(SHEET_NAME)

const ModelSheet: React.FC = () => {
  const [sheetData, setSheetData] = useState<ModelSheetData>(currentSheetData)
  const { mentions, setMentions, multiple = false } = sheetData
  const { t } = useTranslation()
  const [selectedModels, setSelectedModels] = useState<string[]>(() => mentions.map(m => getModelUniqId(m)))
  const [searchQuery, setSearchQuery] = useState('')
  const [isMultiSelectActive, setIsMultiSelectActive] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [activeProvider, setActiveProvider] = useState<string>('')
  const bottom = useBottom()
  const navigation = useNavigation<HomeNavigationProps>()
  const listRef = useRef<LegendListRef>(null)
  const isScrollingByTab = useRef(false)
  const { height: windowHeight } = useWindowDimensions()
  const sheetContentHeight = windowHeight * 0.85 // 与 detents 保持一致
  const { isDark } = useTheme()
  useEffect(() => {
    updateSheetDataCallback = setSheetData
    return () => {
      updateSheetDataCallback = null
    }
  }, [])

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
      dismissModelSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

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

  // 计算每个 Provider Header 在列表中的偏移量
  const providerOffsets = useMemo(() => {
    const offsets: Record<string, number> = {}
    let currentOffset = HEADER_HEIGHT // 搜索栏高度

    selectOptions.forEach((group, index) => {
      if (index !== 0) {
        currentOffset += GROUP_MARGIN_TOP
      }
      offsets[group.label] = currentOffset
      // header高度 + 所有model项高度 + 分隔符高度
      currentOffset += HEADER_ITEM_HEIGHT + group.options.length * (MODEL_ITEM_HEIGHT + SEPARATOR_HEIGHT)
    })

    return offsets
  }, [selectOptions])

  // 滚动同步：根据滚动位置更新当前 Tab
  const handleScroll = useCallback(
    (event: NativeScrollEvent) => {
      if (isScrollingByTab.current) return

      const offsetY = event.contentOffset.y

      // 找到当前可见的 provider
      let currentProvider = selectOptions[0]?.label || ''
      const sortedOffsets = Object.entries(providerOffsets).sort((a, b) => a[1] - b[1])
      for (const [label, offset] of sortedOffsets) {
        if (offsetY >= offset - 50) {
          // 50px 容差
          currentProvider = label
        } else {
          break
        }
      }

      if (currentProvider !== activeProvider) {
        setActiveProvider(currentProvider)
      }
    },
    [providerOffsets, activeProvider, selectOptions]
  )

  // 点击 Tab 滚动到对应 Provider
  const handleProviderChange = useCallback(
    (providerLabel: string) => {
      setActiveProvider(providerLabel)
      isScrollingByTab.current = true

      const offset = providerOffsets[providerLabel]
      if (listRef.current && offset !== undefined) {
        listRef.current.scrollToOffset({
          offset,
          animated: true
        })
      }

      // 滚动动画完成后重置标记
      setTimeout(() => {
        isScrollingByTab.current = false
      }, 500)
    },
    [providerOffsets]
  )

  // 初始化 activeProvider
  useEffect(() => {
    if (isVisible && selectOptions.length > 0 && !activeProvider) {
      setActiveProvider(selectOptions[0].label)
    }
  }, [isVisible, selectOptions, activeProvider])

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

      dismissModelSheet()
    }

    setSelectedModels(newSelection)

    const newMentions = allModelOptions
      .filter(option => newSelection.includes(option.value))
      .map(option => option.model)
    InteractionManager.runAfterInteractions(async () => {
      await Promise.resolve(setMentions(newMentions, isMultiSelectActive))
    })
  }

  const handleClearAll = async () => {
    setSelectedModels([])
    await Promise.resolve(setMentions([]))
  }

  const toggleMultiSelectMode = async () => {
    const newMultiSelectActive = !isMultiSelectActive
    setIsMultiSelectActive(newMultiSelectActive)

    // 如果切换到单选模式且当前有多个选择，只保留第一个
    if (!newMultiSelectActive && selectedModels.length > 1) {
      const firstSelected = selectedModels[0]
      setSelectedModels([firstSelected])
      const newMentions = allModelOptions.filter(option => option.value === firstSelected).map(option => option.model)
      await Promise.resolve(setMentions(newMentions))
    }
  }

  const navigateToProvidersSetting = (provider: Provider) => {
    dismissModelSheet()
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

  const listHeaderComponent = (
    <YStack className="h-20 gap-4">
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
            className={`h-10 rounded-xl ${
              isMultiSelectActive ? 'primary-container border' : 'bg-card border border-transparent'
            }`}
            onPress={toggleMultiSelectMode}>
            <Button.Label>
              <Text className={isMultiSelectActive ? 'primary-text' : 'text-foreground'}>{t('button.multiple')}</Text>
            </Button.Label>
          </Button>
        )}
        {multiple && isMultiSelectActive && (
          <Button
            size="sm"
            feedbackVariant="ripple"
            className="bg-card h-10 rounded-full"
            isIconOnly
            onPress={handleClearAll}>
            <Button.Label>
              <BrushCleaning size={18} className="text-foreground" />
            </Button.Label>
          </Button>
        )}
      </XStack>
    </YStack>
  )

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={[0.85]}
      cornerRadius={30}
      grabber={Platform.OS === 'ios' ? true : false}
      dismissible
      dimmed
      keyboardMode="pan"
      scrollable
      onDidDismiss={handleDidDismiss}
      onDidPresent={handleDidPresent}>
      <View className={isIOS ? undefined : 'bg-card'} style={{ height: sheetContentHeight, position: 'relative' }}>
        <LegendList
          style={{ flex: 1 }}
          ref={listRef}
          data={listData}
          extraData={{ selectedModels, isMultiSelectActive, searchQuery, activeProvider }}
          nestedScrollEnabled={Platform.OS === 'android'}
          onScroll={e => handleScroll(e.nativeEvent)}
          scrollEventThrottle={16}
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
                    <Text className="text-zinc-400/400 text-lg font-bold ">{item.label.toUpperCase()}</Text>
                  </XStack>
                  {item.provider.id !== 'cherryai' && (
                    <TouchableOpacity onPress={() => navigateToProvidersSetting(item.provider)}>
                      <Settings className="text-zinc-600/80" size={16} />
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
                  isSelected ? 'primary-container' : 'border-transparent bg-transparent'
                }`}>
                <XStack className="w-full items-center gap-2 py-1">
                  <XStack className="items-center justify-center">
                    <ModelIcon model={item.model} size={24} />
                  </XStack>
                  <YStack className="flex-1 gap-1">
                    <Text
                      className={cn('text-sm leading-none', isSelected ? 'primary-text' : 'text-foreground')}
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
          ListHeaderComponent={listHeaderComponent}
          ItemSeparatorComponent={() => <YStack className="h-2" />}
          ListEmptyComponent={<EmptyModelView />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: bottom + TAB_BAR_HEIGHT + 20
          }}
          estimatedItemSize={ESTIMATED_ITEM_SIZE}
          drawDistance={DRAW_DISTANCE}
          recycleItems
        />
        {/* Floating Provider Tab Bar */}
        {selectOptions.length > 0 && (
          <View
            className="bg-card absolute bottom-0 left-0 right-0 overflow-hidden "
            style={{ paddingBottom: isIOS ? bottom + 35 : bottom, paddingHorizontal: 10 }}>
            <Tabs value={activeProvider} onValueChange={handleProviderChange}>
              <Tabs.ScrollView>
                <Tabs.List aria-label="Provider tabs" className="bg-transparent">
                  <Tabs.Indicator className="primary-container rounded-xl border" />
                  {selectOptions.map(group => (
                    <Tabs.Trigger key={group.label} value={group.label}>
                      <XStack className="items-center gap-1.5 px-1">
                        <ProviderIcon provider={group.provider} size={18} />
                        <Tabs.Label className={cn(activeProvider === group.label ? 'primary-text' : undefined)}>
                          {group.label}
                        </Tabs.Label>
                      </XStack>
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>
              </Tabs.ScrollView>
            </Tabs>
          </View>
        )}
      </View>
    </TrueSheet>
  )
}

ModelSheet.displayName = 'ModelSheet'

export default ModelSheet

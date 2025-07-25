import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { BrushCleaning } from '@tamagui/lucide-icons'
import { sortBy } from 'lodash'
import debounce from 'lodash/debounce'
import { forwardRef, useCallback, useEffect, useState } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Stack, Text, useTheme, View, XStack, YStack } from 'tamagui'

import { ModelIcon } from '@/components/ui/ModelIcon'
import { ModelTags } from '@/components/ui/ModelTags'
import { isEmbeddingModel } from '@/config/models/embedding'
import { isRerankModel } from '@/config/models/rerank'
import { useAllProviders } from '@/hooks/useProviders'
import { Model } from '@/types/assistant'
import { useIsDark } from '@/utils'
import { getModelUniqId } from '@/utils/model'

import { ProviderIcon } from '../ui/ProviderIcon'
import { BottomSheetSearchInput } from './BottomSheetSearchInput'

interface ModelSheetProps {
  mentions: Model[]
  setMentions: (mentions: Model[]) => void
  multiple?: boolean
}

const ModelSheet = forwardRef<BottomSheetModal, ModelSheetProps>(({ mentions, setMentions, multiple }, ref) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDark = useIsDark()
  const [selectedModels, setSelectedModels] = useState<string[]>(() => mentions.map(m => getModelUniqId(m)))
  const [inputValue, setInputValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const debouncedSetQuery = useCallback(
    debounce((query: string) => {
      setSearchQuery(query)
    }, 300),
    []
  )

  const handleSearchChange = (text: string) => {
    setInputValue(text)
    debouncedSetQuery(text)
  }

  useEffect(() => {
    setSelectedModels(mentions.map(m => getModelUniqId(m)))
  }, [mentions])

  const { providers } = useAllProviders()
  const selectOptions = providers
    .filter(p => p.models && p.models.length > 0 && p.enabled)
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

  const handleModelToggle = (modelValue: string) => {
    const isSelected = selectedModels.includes(modelValue)
    let newSelection: string[]

    if (multiple) {
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
    }

    setSelectedModels(newSelection)

    const newMentions = allModelOptions
      .filter(option => newSelection.includes(option.value))
      .map(option => option.model)
    setMentions(newMentions)
  }

  const handleClearAll = () => {
    setSelectedModels([])
    setMentions([])
  }

  // 添加背景组件渲染函数
  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
  )

  return (
    <BottomSheetModal
      snapPoints={['50%']}
      enableDynamicSizing={false}
      ref={ref}
      backgroundStyle={{
        borderRadius: 30,
        backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
      }}
      handleIndicatorStyle={{
        backgroundColor: theme.color.val
      }}
      backdropComponent={renderBackdrop}>
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        <YStack gap={5} padding="20">
          <XStack gap={5}>
            <Stack flex={1}>
              <BottomSheetSearchInput
                value={inputValue}
                onChangeText={handleSearchChange}
                placeholder={t('common.search_placeholder')}
              />
            </Stack>
            {multiple && <Button circular chromeless onPress={handleClearAll} icon={<BrushCleaning size={18} />} />}
          </XStack>
          {selectOptions.map((group, groupIndex) => (
            <View key={group.title || group.label || groupIndex} gap={5}>
              <XStack gap={8} alignItems="center" justifyContent="flex-start">
                <ProviderIcon provider={group.provider} />
                <Text fontSize={12}>{group.label}</Text>
              </XStack>
              <YStack gap={2}>
                {group.options.map(item => (
                  <Button
                    key={item.value}
                    onPress={() => handleModelToggle(item.value)}
                    justifyContent="space-between"
                    chromeless
                    paddingHorizontal={8}
                    paddingVertical={8}
                    borderWidth={1}
                    borderColor={
                      selectedModels.includes(item.value) ? (isDark ? '$green20Dark' : '$green20Light') : 'transparent'
                    }
                    backgroundColor={
                      selectedModels.includes(item.value) ? (isDark ? '$green10Dark' : '$green10Light') : 'transparent'
                    }>
                    <XStack gap={8} flex={1} alignItems="center" justifyContent="space-between" width="100%">
                      <XStack gap={8} flex={1} alignItems="center" maxWidth="80%">
                        {/* Model icon */}
                        <XStack justifyContent="center" alignItems="center" flexShrink={0}>
                          <ModelIcon model={item.model} />
                        </XStack>
                        {/* Model name */}
                        <Text numberOfLines={1} ellipsizeMode="tail" flex={1}>
                          {item.label}
                        </Text>
                      </XStack>
                      <XStack gap={8} alignItems="center" flexShrink={0}>
                        {/* Model tags */}
                        <ModelTags model={item.model} size={11} style={{ flexShrink: 0 }} />
                      </XStack>
                    </XStack>
                  </Button>
                ))}
              </YStack>
            </View>
          ))}
        </YStack>
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

ModelSheet.displayName = 'MentionSheet'

export default ModelSheet

import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import { Check } from '@tamagui/lucide-icons'
import { sortBy } from 'lodash'
import { forwardRef, useEffect, useState } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Text, useTheme, View, XStack, YStack } from 'tamagui'

import { ModelIcon } from '@/components/ui/ModelIcon'
import { ModelTags } from '@/components/ui/ModelTags'
import { isEmbeddingModel } from '@/config/models/embedding'
import { useAllProviders } from '@/hooks/useProviders'
import { Model } from '@/types/assistant'
import { getModelUniqId } from '@/utils/model'

interface MentionSheetProps {
  mentions: Model[]
  setMentions: (mentions: Model[]) => void
}

const MentionSheet = forwardRef<BottomSheetModal, MentionSheetProps>(({ mentions, setMentions }, ref) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const [selectedModels, setSelectedModels] = useState<string[]>(() => mentions.map(m => getModelUniqId(m)))

  useEffect(() => {
    setSelectedModels(mentions.map(m => getModelUniqId(m)))
  }, [mentions])

  const { providers } = useAllProviders()
  const selectOptions = providers
    .filter(p => p.models && p.models.length > 0 && p.enabled)
    .map(p => ({
      label: p.isSystem ? t(`provider.${p.id}`) : p.name,
      title: p.name,
      options: sortBy(p.models, 'name')
        .filter(m => !isEmbeddingModel(m))
        .map(m => ({
          label: `${m.name}`,
          value: getModelUniqId(m),
          model: m
        }))
    }))

  const allModelOptions = selectOptions.flatMap(group => group.options)

  const handleModelToggle = (modelValue: string) => {
    const isSelected = selectedModels.includes(modelValue)
    let newSelection: string[]

    if (!isSelected) {
      newSelection = [...selectedModels, modelValue]
    } else {
      newSelection = selectedModels.filter(id => id !== modelValue)
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
    ;(ref as React.MutableRefObject<BottomSheetModal>)?.current?.dismiss()
  }

  // 添加背景组件渲染函数
  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
  )

  return (
    <BottomSheetModal
      snapPoints={['50%', '90%']}
      enableDynamicSizing={true}
      ref={ref}
      backgroundStyle={{
        borderRadius: 30,
        backgroundColor: theme.gray2.val
      }}
      handleIndicatorStyle={{
        backgroundColor: theme.color.val
      }}
      backdropComponent={renderBackdrop}>
      <BottomSheetView>
        <YStack gap={5} padding="20">
          <Button onPress={handleClearAll}>{t('common.clear_all')}</Button>
          {selectOptions.map((group, groupIndex) => (
            <View key={group.title || group.label || groupIndex}>
              {group.label && group.label.trim() !== '' && <Text fontSize={12}>{group.label}</Text>}
              {group.options.map(item => (
                <Button
                  key={item.value}
                  onPress={() => handleModelToggle(item.value)}
                  justifyContent="space-between"
                  chromeless
                  paddingHorizontal={8}
                  paddingVertical={8}>
                  <XStack gap={8} flex={1} alignItems="center" justifyContent="space-between" width="100%">
                    <XStack gap={8} flex={1} alignItems="center" maxWidth="70%">
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
                      {/* Check icon */}
                      <XStack justifyContent="center" alignItems="center" flexShrink={0}>
                        {selectedModels.includes(item.value) ? <Check size={20} /> : <View width={20} />}
                      </XStack>
                    </XStack>
                  </XStack>
                </Button>
              ))}
            </View>
          ))}
        </YStack>
      </BottomSheetView>
    </BottomSheetModal>
  )
})

MentionSheet.displayName = 'MentionSheet'

export default MentionSheet

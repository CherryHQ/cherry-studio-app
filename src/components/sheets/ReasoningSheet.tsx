import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import { Check } from '@tamagui/lucide-icons'
import React, { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Text, useTheme, View, XStack, YStack } from 'tamagui'

import {
  MdiLightbulbAutoOutline,
  MdiLightbulbOn10,
  MdiLightbulbOn50,
  MdiLightbulbOn90
} from '@/components/icons/MdiLightbulbIcon'
import { ReasoningEffortOptions } from '@/types/assistant'

interface ReasoningSheetProps {
  value: string
  onValueChange: (value: ReasoningEffortOptions) => void
}

export const ReasoningSheet = forwardRef<BottomSheetModal, ReasoningSheetProps>(({ value, onValueChange }, ref) => {
  const { t } = useTranslation()
  const theme = useTheme()

  const handleValueChange = (newValue: ReasoningEffortOptions) => {
    onValueChange(newValue)
    ;(ref as React.MutableRefObject<BottomSheetModal>)?.current?.dismiss()
  }

  const options = [
    {
      value: 'auto' as ReasoningEffortOptions,
      label: t('assistants.settings.reasoning.auto'),
      icon: <MdiLightbulbAutoOutline />
    },
    {
      value: 'high' as ReasoningEffortOptions,
      label: t('assistants.settings.reasoning.high'),
      icon: <MdiLightbulbOn90 />
    },
    {
      value: 'medium' as ReasoningEffortOptions,
      label: t('assistants.settings.reasoning.medium'),
      icon: <MdiLightbulbOn50 />
    },
    {
      value: 'low' as ReasoningEffortOptions,
      label: t('assistants.settings.reasoning.low'),
      icon: <MdiLightbulbOn10 />
    }
  ]

  // 添加背景组件渲染函数
  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
  )

  return (
    <BottomSheetModal
      snapPoints={['30%']}
      backdropComponent={renderBackdrop}
      enableDynamicSizing={true}
      ref={ref}
      backgroundStyle={{
        borderRadius: 30,
        backgroundColor: theme.gray2.val
      }}
      handleIndicatorStyle={{
        backgroundColor: theme.color.val
      }}>
      <BottomSheetView>
        <YStack gap={10} padding="20">
          {options.map(option => (
            <Button
              key={option.value}
              icon={option.icon}
              onPress={() => handleValueChange(option.value)}
              justifyContent="space-between"
              chromeless>
              <XStack flex={1} justifyContent="space-between" alignItems="center">
                <Text>{option.label}</Text>
                {value === option.value ? <Check size={20} /> : <View width={20} />}
              </XStack>
            </Button>
          ))}
        </YStack>
      </BottomSheetView>
    </BottomSheetModal>
  )
})

ReasoningSheet.displayName = 'ReasoningSheet'

import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { ChevronRight } from '@tamagui/lucide-icons'
import React, { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Text } from 'tamagui'

import { Assistant, ReasoningEffortOptions } from '@/types/assistant'

import { ReasoningSheet } from '../sheets/ReasoningSheet'

interface ReasoningSelectProps {
  assistant: Assistant
  onValueChange: (value: string) => void
}

export function ReasoningSelect({ assistant, onValueChange }: ReasoningSelectProps) {
  const { t } = useTranslation()
  const reasoningEffort = assistant?.settings?.reasoning_effort || 'auto'

  const bottomSheetModalRef = useRef<BottomSheetModal>(null)

  const handlePresentModalPress = () => {
    bottomSheetModalRef.current?.present()
  }

  const handleValueChange = (newValue: ReasoningEffortOptions) => {
    onValueChange?.(newValue)
  }

  return (
    <>
      <Button
        width="30%"
        backgroundColor="$colorTransparent"
        borderWidth={0}
        iconAfter={ChevronRight}
        onPress={handlePresentModalPress}
        justifyContent="flex-start"
        padding={0}>
        <Text
          fontSize={12}
          backgroundColor="$backgroundGreen"
          color="$foregroundGreen"
          paddingHorizontal={5}
          borderRadius={5}>
          {t(`assistants.settings.reasoning.${reasoningEffort}`)}
        </Text>
      </Button>

      <ReasoningSheet ref={bottomSheetModalRef} value={reasoningEffort} onValueChange={handleValueChange} />
    </>
  )
}

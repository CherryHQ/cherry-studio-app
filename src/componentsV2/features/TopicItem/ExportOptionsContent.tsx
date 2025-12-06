import { Checkbox } from 'heroui-native'
import type { FC, MutableRefObject } from 'react'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import Text from '@/componentsV2/base/Text'
import XStack from '@/componentsV2/layout/XStack'

interface ExportOptionsContentProps {
  optionsRef: MutableRefObject<{ includeReasoning: boolean }>
}

export const ExportOptionsContent: FC<ExportOptionsContentProps> = ({ optionsRef }) => {
  const { t } = useTranslation()
  const [includeReasoning, setIncludeReasoning] = useState(false)

  const handleChange = (value: boolean) => {
    setIncludeReasoning(value)
    optionsRef.current.includeReasoning = value
  }

  return (
    <Pressable onPress={() => handleChange(!includeReasoning)}>
      <XStack className="items-center gap-2 py-2">
        <Checkbox className="primary-container border" isSelected={includeReasoning} onSelectedChange={handleChange}>
          <Checkbox.Indicator className="secondary-container" />
        </Checkbox>
        <Text className="text-foreground-secondary">{t('export.options.include_reasoning')}</Text>
      </XStack>
    </Pressable>
  )
}

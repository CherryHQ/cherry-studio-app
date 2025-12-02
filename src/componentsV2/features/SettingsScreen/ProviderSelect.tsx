import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Button } from 'heroui-native'
import React, { useId, useState } from 'react'
import { TouchableOpacity } from 'react-native'

import SelectionSheet, { type SelectionSheetItem } from '@/componentsV2/base/SelectionSheet'
import { ChevronDown } from '@/componentsV2/icons'
import type { ProviderType } from '@/types/assistant'

interface ProviderSelectProps {
  value: ProviderType | undefined
  onValueChange: (value: ProviderType) => void
  placeholder: string
  className?: string
}

// Internal display value for UI differentiation
type DisplayValue = ProviderType | 'cherry-in'

interface DisplayOptionItem {
  label: string
  value: DisplayValue
  mappedValue?: ProviderType // Actual value to save
}

// Map display value to actual ProviderType for saving
const VALUE_MAPPING: Partial<Record<DisplayValue, ProviderType>> = {
  'cherry-in': 'new-api'
}

const providerOptions: DisplayOptionItem[] = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'OpenAI-Response', value: 'openai-response' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Azure OpenAI', value: 'azure-openai' },
  { label: 'New API', value: 'new-api' },
  { label: 'CherryIN', value: 'cherry-in', mappedValue: 'new-api' }
]

export function ProviderSelect({ value, onValueChange, placeholder, className }: ProviderSelectProps) {
  const sheetName = useId()
  // Internal state to track the actual selected display value (for UI differentiation)
  const [displayValue, setDisplayValue] = useState<DisplayValue | undefined>(value)

  const handleValueChange = (newValue: DisplayValue) => {
    setDisplayValue(newValue)
    // Map display value to actual ProviderType
    const actualValue = VALUE_MAPPING[newValue] ?? (newValue as ProviderType)
    onValueChange(actualValue)
  }

  const selectedOption = providerOptions.find(opt => opt.value === displayValue)

  const sheetItems: SelectionSheetItem[] = providerOptions.map(option => ({
    id: option.value,
    label: option.label,
    isSelected: displayValue === option.value,
    onSelect: () => handleValueChange(option.value)
  }))

  return (
    <>
      <TouchableOpacity onPress={() => TrueSheet.present(sheetName)} activeOpacity={0.7} className={className}>
        <Button
          feedbackVariant="ripple"
          className="h-8 w-full justify-between rounded-lg"
          variant="tertiary"
          size="sm"
          pointerEvents="none">
          <Button.Label className="text-base">{selectedOption ? selectedOption.label : placeholder}</Button.Label>
          <ChevronDown />
        </Button>
      </TouchableOpacity>
      <SelectionSheet detents={['auto', 0.6]} name={sheetName} items={sheetItems} placeholder={placeholder} />
    </>
  )
}

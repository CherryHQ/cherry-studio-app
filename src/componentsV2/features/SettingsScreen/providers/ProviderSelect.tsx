import { Button } from 'heroui-native'
import React, { useState } from 'react'
import { Pressable } from 'react-native'

import SelectionDropdown, { type SelectionDropdownItem } from '@/componentsV2/base/SelectionDropdown'
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
  // Internal state to track the actual selected display value (for UI differentiation)
  const [displayValue, setDisplayValue] = useState<DisplayValue | undefined>(value)

  const handleValueChange = (newValue: DisplayValue) => {
    setDisplayValue(newValue)
    // Map display value to actual ProviderType
    const actualValue = VALUE_MAPPING[newValue] ?? (newValue as ProviderType)
    onValueChange(actualValue)
  }

  const selectedOption = providerOptions.find(opt => opt.value === displayValue)

  const dropdownItems: SelectionDropdownItem[] = providerOptions.map(option => ({
    id: option.value,
    label: option.label,
    isSelected: displayValue === option.value,
    onSelect: () => handleValueChange(option.value)
  }))

  return (
    <SelectionDropdown items={dropdownItems}>
      <Pressable className={className}>
        <Button
          pressableFeedbackVariant="ripple"
          className="h-8 justify-between rounded-lg"
          variant="tertiary"
          size="sm"
          pointerEvents="none">
          <Button.Label className="text-base">{selectedOption ? selectedOption.label : placeholder}</Button.Label>
          <ChevronDown />
        </Button>
      </Pressable>
    </SelectionDropdown>
  )
}

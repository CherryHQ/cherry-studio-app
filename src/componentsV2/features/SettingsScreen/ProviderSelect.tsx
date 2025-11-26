import { Button } from 'heroui-native'
import React, { useState } from 'react'
import * as DropdownMenu from 'zeego/dropdown-menu'

import { ChevronDown } from '@/componentsV2/icons'
import type { ProviderType } from '@/types/assistant'

interface SelectOptionItem {
  label: string
  value: ProviderType
}

interface SelectOptionGroup {
  label: string
  title?: string
  options: SelectOptionItem[]
}

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

interface DisplayOptionGroup {
  label: string
  options: DisplayOptionItem[]
}

// Map display value to actual ProviderType for saving
const VALUE_MAPPING: Partial<Record<DisplayValue, ProviderType>> = {
  'cherry-in': 'new-api'
}

const providerOptions: DisplayOptionGroup[] = [
  {
    label: 'Providers',
    options: [
      { label: 'OpenAI', value: 'openai' },
      { label: 'OpenAI-Response', value: 'openai-response' },
      { label: 'Gemini', value: 'gemini' },
      { label: 'Anthropic', value: 'anthropic' },
      { label: 'Azure OpenAI', value: 'azure-openai' },
      { label: 'New API', value: 'new-api' },
      { label: 'CherryIN', value: 'cherry-in', mappedValue: 'new-api' }
    ]
  }
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

  const selectedOption = providerOptions.flatMap(group => group.options).find(opt => opt.value === displayValue)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={className}>
        <Button feedbackVariant="ripple" className="h-8 w-full justify-between rounded-lg" variant="tertiary" size="sm">
          <Button.Label className="text-base">{selectedOption ? selectedOption.label : placeholder}</Button.Label>
          <ChevronDown />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {providerOptions.map(group => (
          <DropdownMenu.Group key={group.label}>
            <DropdownMenu.Label>{group.label}</DropdownMenu.Label>
            {group.options.map(option => (
              <DropdownMenu.CheckboxItem
                key={option.value}
                value={displayValue === option.value}
                onValueChange={() => handleValueChange(option.value)}>
                <DropdownMenu.ItemIndicator />
                <DropdownMenu.ItemTitle>{option.label}</DropdownMenu.ItemTitle>
              </DropdownMenu.CheckboxItem>
            ))}
          </DropdownMenu.Group>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}

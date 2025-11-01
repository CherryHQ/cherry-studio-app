import { Button } from 'heroui-native'
import React from 'react'
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
}

const providerOptions: SelectOptionGroup[] = [
  {
    label: 'Providers',
    options: [
      { label: 'OpenAI', value: 'openai' },
      { label: 'OpenAI-Response', value: 'openai-response' },
      { label: 'Gemini', value: 'gemini' },
      { label: 'Anthropic', value: 'anthropic' },
      { label: 'Azure OpenAI', value: 'azure-openai' },
      { label: 'Qwen', value: 'qwenlm' }
    ]
  }
]

export function ProviderSelect({ value, onValueChange, placeholder }: ProviderSelectProps) {
  const handleValueChange = (newValue: string) => {
    onValueChange(newValue as ProviderType)
  }

  const selectedOption = providerOptions.flatMap(group => group.options).find(opt => opt.value === value)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button className="justify-between" variant="tertiary" size="sm">
          <Button.Label className="text-base">{selectedOption ? selectedOption.label : placeholder}</Button.Label>
          <ChevronDown />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {providerOptions.map(group => (
          <DropdownMenu.Group key={group.label}>
            <DropdownMenu.Label>{group.label}</DropdownMenu.Label>
            {group.options.map(option => (
              <DropdownMenu.Item key={option.value} onSelect={() => handleValueChange(option.value)}>
                {option.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Group>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}

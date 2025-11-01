import { Button } from 'heroui-native'
import { sortBy } from 'lodash'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as DropdownMenu from 'zeego/dropdown-menu'

import { ChevronDown } from '@/componentsV2/icons'
import { isEmbeddingModel } from '@/config/models'
import type { Model, Provider } from '@/types/assistant'
import { getModelUniqId } from '@/utils/model'

interface ModelSelectProps {
  provider: Provider
  onSelectModel: (model: Model | undefined) => void
}

export function ModelSelect({ provider, onSelectModel }: ModelSelectProps) {
  const { t } = useTranslation()
  const [selectedModel, setSelectedModel] = useState<Model | undefined>()

  const selectOptions = !provider.models?.length
    ? []
    : [
        {
          label: provider.isSystem ? t(`provider.${provider.id}`) : provider.name,
          title: provider.name,
          options: sortBy(provider.models, 'name')
            .filter(model => !isEmbeddingModel(model))
            .map(model => ({
              label: model.name,
              value: getModelUniqId(model),
              model
            }))
        }
      ]

  const handleValueChange = (value: string) => {
    if (!value) {
      setSelectedModel(undefined)
      onSelectModel(undefined)
      return
    }

    const allOptions = selectOptions.flatMap(group => group.options)
    const foundOption = allOptions.find(opt => opt.value === value)
    const model = foundOption?.model
    setSelectedModel(model)
    onSelectModel(model)
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button variant="tertiary">
          <Button.Label>{selectedModel ? selectedModel.id : t('settings.provider.api_check.tooltip')}</Button.Label>
          <ChevronDown />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {selectOptions.map(group => (
          <DropdownMenu.Group key={group.label}>
            <DropdownMenu.Label>{t(`${group.label}`)}</DropdownMenu.Label>
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

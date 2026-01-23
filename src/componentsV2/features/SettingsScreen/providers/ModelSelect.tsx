import { Button } from 'heroui-native'
import { sortBy } from 'lodash'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import SelectionDropdown from '@/componentsV2/base/SelectionDropdown'
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
    : sortBy(provider.models, 'name')
        .filter(model => !isEmbeddingModel(model))
        .map(model => ({
          id: getModelUniqId(model),
          label: model.name,
          model
        }))

  const handleValueChange = (value: string) => {
    const foundOption = selectOptions.find(opt => opt.id === value)
    const model = foundOption?.model
    setSelectedModel(model)
    onSelectModel(model)
  }

  return (
    <SelectionDropdown
      items={selectOptions}
      value={selectedModel ? getModelUniqId(selectedModel) : ''}
      onValueChange={handleValueChange}>
      <Button className="rounded-xl" pressableFeedbackVariant="ripple" variant="tertiary">
        <Button.Label>{selectedModel ? selectedModel.id : t('settings.provider.api_check.tooltip')}</Button.Label>
        <ChevronDown />
      </Button>
    </SelectionDropdown>
  )
}

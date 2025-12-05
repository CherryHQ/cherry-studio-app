import type { Model, Provider } from '@/types/assistant'

// SectionList data types
export interface ModelOption {
  label: string
  value: string
  model: Model
}

export interface ProviderSection {
  title: string
  provider: Provider
  data: ModelOption[]
}

export interface ModelSheetData {
  mentions: Model[]
  setMentions: (mentions: Model[], isMultiSelectActive?: boolean) => Promise<void> | void
  multiple?: boolean
}

export interface SelectOption {
  label: string
  title: string
  provider: Provider
  options: ModelOption[]
}

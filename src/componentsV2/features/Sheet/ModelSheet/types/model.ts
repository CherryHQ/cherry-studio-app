import type { Model, Provider } from '@/types/assistant'

/**
 * Represents a single model option in the selection list
 */
export interface ModelOption {
  label: string
  value: string
  model: Model
}

/**
 * Represents a provider section in the SectionList
 */
export interface ProviderSection {
  title: string
  provider: Provider
  data: ModelOption[]
}

/**
 * Represents a grouped set of model options by provider
 */
export interface SelectOption {
  label: string
  title: string
  provider: Provider
  options: ModelOption[]
}

import { renderHook } from '@testing-library/react-native'

import type { Model, Provider } from '@/types/assistant'

import { useModelOptions } from '../hooks/useModelOptions'

let mockProviders: Provider[] = []

jest.mock('@/config/models', () => ({
  isEmbeddingModel: jest.fn(() => false),
  isRerankModel: jest.fn(() => false)
}))

jest.mock('@/hooks/useProviders', () => ({
  useAllProviders: () => ({ providers: mockProviders })
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

const buildModel = (id: string, provider: string, name: string): Model => ({
  id,
  provider,
  name,
  group: 'test'
})

const buildProvider = (id: string, name: string, models: Model[]): Provider => ({
  id,
  type: 'openai',
  name,
  apiKey: '',
  apiHost: '',
  models,
  enabled: true
})

describe('useModelOptions', () => {
  beforeEach(() => {
    mockProviders = []
  })

  it('keeps allModelOptions independent of search', () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const modelB = buildModel('beta', 'provider-a', 'Beta')
    mockProviders = [buildProvider('provider-a', 'Provider A', [modelB, modelA])]

    const { result } = renderHook(() => useModelOptions({ searchQuery: 'alpha' }))

    expect(result.current.selectOptions).toHaveLength(1)
    expect(result.current.selectOptions[0].options).toHaveLength(1)
    expect(result.current.selectOptions[0].options[0].label).toBe('Alpha')
    expect(result.current.allModelOptions).toHaveLength(2)
  })

  it('applies filterFn to both all and visible options', () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const modelB = buildModel('beta', 'provider-a', 'Beta')
    mockProviders = [buildProvider('provider-a', 'Provider A', [modelA, modelB])]

    const { result } = renderHook(() =>
      useModelOptions({
        searchQuery: '',
        filterFn: model => model.id !== 'beta'
      })
    )

    expect(result.current.allModelOptions).toHaveLength(1)
    expect(result.current.allModelOptions[0].label).toBe('Alpha')
    expect(result.current.selectOptions[0].options).toHaveLength(1)
  })
})

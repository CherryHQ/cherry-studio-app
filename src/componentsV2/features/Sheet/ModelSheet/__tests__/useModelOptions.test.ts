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

  it('excludes disabled providers', () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const modelB = buildModel('beta', 'provider-b', 'Beta')
    mockProviders = [
      buildProvider('provider-a', 'Provider A', [modelA]),
      { ...buildProvider('provider-b', 'Provider B', [modelB]), enabled: false }
    ]

    const { result } = renderHook(() => useModelOptions({ searchQuery: '' }))

    expect(result.current.selectOptions).toHaveLength(1)
    expect(result.current.selectOptions[0].title).toBe('Provider A')
  })

  it('includes cherryai provider even without models', () => {
    mockProviders = [{ ...buildProvider('cherryai', 'Cherry AI', []), enabled: true }]

    const { result } = renderHook(() => useModelOptions({ searchQuery: '' }))

    expect(result.current.selectOptions).toHaveLength(0)
    expect(result.current.allModelOptions).toHaveLength(0)
  })

  it('sorts models by name within each provider', () => {
    const modelC = buildModel('gamma', 'provider-a', 'Charlie')
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const modelB = buildModel('beta', 'provider-a', 'Bravo')
    mockProviders = [buildProvider('provider-a', 'Provider A', [modelC, modelA, modelB])]

    const { result } = renderHook(() => useModelOptions({ searchQuery: '' }))

    expect(result.current.selectOptions[0].options.map(o => o.label)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('returns empty arrays when providers list is empty', () => {
    mockProviders = []

    const { result } = renderHook(() => useModelOptions({ searchQuery: '' }))

    expect(result.current.selectOptions).toHaveLength(0)
    expect(result.current.allModelOptions).toHaveLength(0)
    expect(result.current.sections).toHaveLength(0)
  })

  it('returns empty sections when search has no results', () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    mockProviders = [buildProvider('provider-a', 'Provider A', [modelA])]

    const { result } = renderHook(() => useModelOptions({ searchQuery: 'nonexistent' }))

    expect(result.current.selectOptions).toHaveLength(0)
    expect(result.current.sections).toHaveLength(0)
    expect(result.current.allModelOptions).toHaveLength(1)
  })

  it('uses translated label for system providers', () => {
    const modelA = buildModel('alpha', 'openai', 'GPT-4')
    mockProviders = [{ ...buildProvider('openai', 'OpenAI', [modelA]), isSystem: true }]

    const { result } = renderHook(() => useModelOptions({ searchQuery: '' }))

    expect(result.current.selectOptions[0].label).toBe('provider.openai')
    expect(result.current.selectOptions[0].title).toBe('OpenAI')
  })

  it('groups models by provider correctly', () => {
    const modelA = buildModel('alpha', 'provider-a', 'Alpha')
    const modelB = buildModel('beta', 'provider-b', 'Beta')
    mockProviders = [
      buildProvider('provider-a', 'Provider A', [modelA]),
      buildProvider('provider-b', 'Provider B', [modelB])
    ]

    const { result } = renderHook(() => useModelOptions({ searchQuery: '' }))

    expect(result.current.selectOptions).toHaveLength(2)
    expect(result.current.sections).toHaveLength(2)
    expect(result.current.sections[0].data).toHaveLength(1)
    expect(result.current.sections[1].data).toHaveLength(1)
  })
})

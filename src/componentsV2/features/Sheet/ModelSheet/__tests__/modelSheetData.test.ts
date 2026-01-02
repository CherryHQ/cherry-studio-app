import type { Model, Provider } from '@/types/assistant'

import {
  buildSections,
  buildSelectOptions,
  filterModels,
  filterValidProviders,
  getAllModelOptions,
  mapMentionsToSelection,
  mapSelectionToMentions,
  shouldIncludeModel
} from '../modelSheetData'
import type { ModelOption } from '../types'

// Mock the config/models module to avoid SQLite dependency
jest.mock('@/config/models', () => ({
  isEmbeddingModel: (model: Model) => model.id.includes('embedding'),
  isRerankModel: (model: Model) => model.id.includes('rerank')
}))

// Mock utils/model
jest.mock('@/utils/model', () => ({
  getModelUniqId: (model: Model) => `${model.provider}:${model.id}`
}))

// Mock model factory
const createModel = (overrides: Partial<Model> = {}): Model =>
  ({
    id: 'test-model',
    name: 'Test Model',
    provider: 'test-provider',
    ...overrides
  }) as Model

// Mock provider factory
const createProvider = (overrides: Partial<Provider> = {}): Provider =>
  ({
    id: 'test-provider',
    name: 'Test Provider',
    isSystem: false,
    enabled: true,
    models: [createModel()],
    ...overrides
  }) as Provider

// Mock translation function
const mockT = ((key: string) => key) as unknown as Parameters<typeof buildSelectOptions>[2]

describe('shouldIncludeModel', () => {
  it('should include regular models', () => {
    const model = createModel({ id: 'gpt-4' })
    expect(shouldIncludeModel(model)).toBe(true)
  })

  it('should exclude embedding models', () => {
    const model = createModel({ id: 'text-embedding-ada-002' })
    expect(shouldIncludeModel(model)).toBe(false)
  })

  it('should exclude rerank models', () => {
    const model = createModel({ id: 'rerank-english-v2.0' })
    expect(shouldIncludeModel(model)).toBe(false)
  })
})

describe('filterModels', () => {
  const models = [
    createModel({ id: 'gpt-4', name: 'GPT-4' }),
    createModel({ id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }),
    createModel({ id: 'claude-3-opus', name: 'Claude 3 Opus' })
  ]

  it('should return all models when query is empty', () => {
    expect(filterModels(models, '')).toEqual(models)
  })

  it('should filter by model id (case insensitive)', () => {
    const result = filterModels(models, 'GPT')
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('gpt-4')
    expect(result[1].id).toBe('gpt-3.5-turbo')
  })

  it('should filter by model name (case insensitive)', () => {
    const result = filterModels(models, 'opus')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Claude 3 Opus')
  })

  it('should return empty array when no matches', () => {
    expect(filterModels(models, 'nonexistent')).toEqual([])
  })
})

describe('filterValidProviders', () => {
  it('should include cherryai provider', () => {
    const providers = [createProvider({ id: 'cherryai', enabled: false, models: [] })]
    expect(filterValidProviders(providers)).toHaveLength(1)
  })

  it('should include enabled providers with models', () => {
    const providers = [createProvider({ id: 'openai', enabled: true, models: [createModel()] })]
    expect(filterValidProviders(providers)).toHaveLength(1)
  })

  it('should exclude disabled providers', () => {
    const providers = [createProvider({ id: 'openai', enabled: false, models: [createModel()] })]
    expect(filterValidProviders(providers)).toHaveLength(0)
  })

  it('should exclude providers without models', () => {
    const providers = [createProvider({ id: 'openai', enabled: true, models: [] })]
    expect(filterValidProviders(providers)).toHaveLength(0)
  })
})

describe('buildSelectOptions', () => {
  it('should build options from valid providers', () => {
    const providers = [
      createProvider({
        id: 'openai',
        name: 'OpenAI',
        models: [createModel({ id: 'gpt-4', name: 'GPT-4' })]
      })
    ]

    const result = buildSelectOptions(providers, '', mockT)

    expect(result).toHaveLength(1)
    expect(result[0].provider.id).toBe('openai')
    expect(result[0].options).toHaveLength(1)
    expect(result[0].options[0].label).toBe('GPT-4')
  })

  it('should apply search filter', () => {
    const providers = [
      createProvider({
        id: 'openai',
        models: [createModel({ id: 'gpt-4', name: 'GPT-4' }), createModel({ id: 'claude-3', name: 'Claude 3' })]
      })
    ]

    const result = buildSelectOptions(providers, 'gpt', mockT)

    expect(result).toHaveLength(1)
    expect(result[0].options).toHaveLength(1)
    expect(result[0].options[0].label).toBe('GPT-4')
  })

  it('should exclude groups with no matching models', () => {
    const providers = [
      createProvider({
        id: 'openai',
        models: [createModel({ id: 'gpt-4', name: 'GPT-4' })]
      })
    ]

    const result = buildSelectOptions(providers, 'nonexistent', mockT)
    expect(result).toHaveLength(0)
  })

  it('should use i18n key for system providers', () => {
    const providers = [
      createProvider({
        id: 'openai',
        name: 'OpenAI',
        isSystem: true,
        models: [createModel()]
      })
    ]

    const result = buildSelectOptions(providers, '', mockT)
    expect(result[0].label).toBe('provider.openai')
  })

  it('should use provider name for non-system providers', () => {
    const providers = [
      createProvider({
        id: 'custom',
        name: 'My Custom Provider',
        isSystem: false,
        models: [createModel()]
      })
    ]

    const result = buildSelectOptions(providers, '', mockT)
    expect(result[0].label).toBe('My Custom Provider')
  })
})

describe('buildSections', () => {
  it('should convert SelectOptions to ProviderSections', () => {
    const provider = createProvider({ id: 'openai', name: 'OpenAI' })
    const options = [
      {
        label: 'OpenAI',
        title: 'OpenAI',
        provider,
        options: [{ label: 'GPT-4', value: 'openai:gpt-4', model: createModel() }]
      }
    ]

    const result = buildSections(options)

    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('openai')
    expect(result[0].title).toBe('OpenAI')
    expect(result[0].provider).toBe(provider)
    expect(result[0].data).toEqual(options[0].options)
  })
})

describe('getAllModelOptions', () => {
  it('should flatten all options from groups', () => {
    const option1: ModelOption = { label: 'GPT-4', value: 'gpt-4', model: createModel() }
    const option2: ModelOption = { label: 'Claude', value: 'claude', model: createModel() }

    const selectOptions = [
      { label: 'OpenAI', title: 'OpenAI', provider: createProvider(), options: [option1] },
      { label: 'Anthropic', title: 'Anthropic', provider: createProvider(), options: [option2] }
    ]

    const result = getAllModelOptions(selectOptions)
    expect(result).toHaveLength(2)
    expect(result).toContain(option1)
    expect(result).toContain(option2)
  })
})

describe('mapMentionsToSelection', () => {
  it('should map models to their unique ids', () => {
    const models = [
      createModel({ id: 'gpt-4', provider: 'openai' }),
      createModel({ id: 'claude-3', provider: 'anthropic' })
    ]

    const result = mapMentionsToSelection(models)
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('gpt-4')
    expect(result[1]).toContain('claude-3')
  })
})

describe('mapSelectionToMentions', () => {
  it('should map selection values back to models', () => {
    const model1 = createModel({ id: 'gpt-4' })
    const model2 = createModel({ id: 'claude-3' })

    const allOptions: ModelOption[] = [
      { label: 'GPT-4', value: 'openai:gpt-4', model: model1 },
      { label: 'Claude', value: 'anthropic:claude-3', model: model2 }
    ]

    const result = mapSelectionToMentions(['openai:gpt-4'], allOptions)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(model1)
  })

  it('should handle empty selection', () => {
    const allOptions: ModelOption[] = [{ label: 'GPT-4', value: 'openai:gpt-4', model: createModel() }]

    const result = mapSelectionToMentions([], allOptions)
    expect(result).toHaveLength(0)
  })
})

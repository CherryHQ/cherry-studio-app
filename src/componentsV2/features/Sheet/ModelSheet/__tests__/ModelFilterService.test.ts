import type { Model } from '@/types/assistant'

import { composeFilters, createModelFilter, filters, matchesSearchQuery } from '../services/ModelFilterService'

jest.mock('@/config/models', () => ({
  isEmbeddingModel: jest.fn((model: Model) => model.id.includes('embedding')),
  isRerankModel: jest.fn((model: Model) => model.id.includes('rerank'))
}))

const buildModel = (id: string, provider: string, name: string): Model => ({
  id,
  provider,
  name,
  group: 'test'
})

describe('ModelFilterService', () => {
  describe('filters', () => {
    it('excludeEmbedding filters out embedding models', () => {
      const embeddingModel = buildModel('text-embedding-3', 'openai', 'Embedding')
      const chatModel = buildModel('gpt-4', 'openai', 'GPT-4')

      expect(filters.excludeEmbedding(embeddingModel)).toBe(false)
      expect(filters.excludeEmbedding(chatModel)).toBe(true)
    })

    it('excludeRerank filters out rerank models', () => {
      const rerankModel = buildModel('rerank-v1', 'cohere', 'Rerank')
      const chatModel = buildModel('gpt-4', 'openai', 'GPT-4')

      expect(filters.excludeRerank(rerankModel)).toBe(false)
      expect(filters.excludeRerank(chatModel)).toBe(true)
    })

    it('excludeNonChat filters out both embedding and rerank models', () => {
      const embeddingModel = buildModel('text-embedding-3', 'openai', 'Embedding')
      const rerankModel = buildModel('rerank-v1', 'cohere', 'Rerank')
      const chatModel = buildModel('gpt-4', 'openai', 'GPT-4')

      expect(filters.excludeNonChat(embeddingModel)).toBe(false)
      expect(filters.excludeNonChat(rerankModel)).toBe(false)
      expect(filters.excludeNonChat(chatModel)).toBe(true)
    })

    it('all returns true for any model', () => {
      expect(filters.all()).toBe(true)
    })
  })

  describe('composeFilters', () => {
    it('composes multiple filters - all must pass', () => {
      const filter1 = (model: Model) => model.id !== 'blocked'
      const filter2 = (model: Model) => model.provider !== 'banned'
      const composed = composeFilters(filter1, filter2)

      expect(composed(buildModel('ok', 'openai', 'OK'))).toBe(true)
      expect(composed(buildModel('blocked', 'openai', 'Blocked'))).toBe(false)
      expect(composed(buildModel('ok', 'banned', 'Banned'))).toBe(false)
    })

    it('returns true when no filters provided', () => {
      const composed = composeFilters()
      expect(composed(buildModel('any', 'any', 'Any'))).toBe(true)
    })

    it('works with single filter', () => {
      const filter = (model: Model) => model.id === 'allowed'
      const composed = composeFilters(filter)

      expect(composed(buildModel('allowed', 'openai', 'Allowed'))).toBe(true)
      expect(composed(buildModel('other', 'openai', 'Other'))).toBe(false)
    })
  })

  describe('createModelFilter', () => {
    it('excludeTypes with embedding excludes embedding models', () => {
      const filter = createModelFilter({ excludeTypes: ['embedding'] })

      expect(filter(buildModel('text-embedding-3', 'openai', 'Embedding'))).toBe(false)
      expect(filter(buildModel('gpt-4', 'openai', 'GPT-4'))).toBe(true)
    })

    it('excludeTypes with rerank excludes rerank models', () => {
      const filter = createModelFilter({ excludeTypes: ['rerank'] })

      expect(filter(buildModel('rerank-v1', 'cohere', 'Rerank'))).toBe(false)
      expect(filter(buildModel('gpt-4', 'openai', 'GPT-4'))).toBe(true)
    })

    it('includeProviders only includes specified providers', () => {
      const filter = createModelFilter({ includeProviders: ['openai', 'anthropic'] })

      expect(filter(buildModel('gpt-4', 'openai', 'GPT-4'))).toBe(true)
      expect(filter(buildModel('claude-3', 'anthropic', 'Claude'))).toBe(true)
      expect(filter(buildModel('gemini', 'google', 'Gemini'))).toBe(false)
    })

    it('excludeProviders excludes specified providers', () => {
      const filter = createModelFilter({ excludeProviders: ['google'] })

      expect(filter(buildModel('gpt-4', 'openai', 'GPT-4'))).toBe(true)
      expect(filter(buildModel('gemini', 'google', 'Gemini'))).toBe(false)
    })

    it('customPredicate applies custom logic', () => {
      const filter = createModelFilter({
        customPredicate: model => model.name.startsWith('GPT')
      })

      expect(filter(buildModel('gpt-4', 'openai', 'GPT-4'))).toBe(true)
      expect(filter(buildModel('claude-3', 'anthropic', 'Claude'))).toBe(false)
    })

    it('combines multiple options', () => {
      const filter = createModelFilter({
        excludeTypes: ['embedding'],
        includeProviders: ['openai'],
        customPredicate: model => model.name.includes('4')
      })

      expect(filter(buildModel('gpt-4', 'openai', 'GPT-4'))).toBe(true)
      expect(filter(buildModel('gpt-3', 'openai', 'GPT-3'))).toBe(false)
      expect(filter(buildModel('gpt-4', 'anthropic', 'GPT-4'))).toBe(false)
      expect(filter(buildModel('text-embedding-4', 'openai', 'Embedding-4'))).toBe(false)
    })

    it('returns filters.all when no options provided', () => {
      const filter = createModelFilter({})

      expect(filter(buildModel('any', 'any', 'Any'))).toBe(true)
    })
  })

  describe('matchesSearchQuery', () => {
    it('returns true for empty query', () => {
      const model = buildModel('gpt-4', 'openai', 'GPT-4')
      expect(matchesSearchQuery(model, 'openai:gpt-4', '')).toBe(true)
    })

    it('matches model name case-insensitively', () => {
      const model = buildModel('gpt-4', 'openai', 'GPT-4')
      expect(matchesSearchQuery(model, 'openai:gpt-4', 'gpt')).toBe(true)
      expect(matchesSearchQuery(model, 'openai:gpt-4', 'GPT')).toBe(true)
      expect(matchesSearchQuery(model, 'openai:gpt-4', 'Gpt')).toBe(true)
    })

    it('matches modelUniqId case-insensitively', () => {
      const model = buildModel('gpt-4', 'openai', 'GPT-4')
      expect(matchesSearchQuery(model, 'openai:gpt-4', 'openai')).toBe(true)
      expect(matchesSearchQuery(model, 'openai:gpt-4', 'OPENAI')).toBe(true)
    })

    it('matches partial strings', () => {
      const model = buildModel('claude-3-opus', 'anthropic', 'Claude 3 Opus')
      expect(matchesSearchQuery(model, 'anthropic:claude-3-opus', 'opus')).toBe(true)
      expect(matchesSearchQuery(model, 'anthropic:claude-3-opus', 'claude')).toBe(true)
      expect(matchesSearchQuery(model, 'anthropic:claude-3-opus', '3')).toBe(true)
    })

    it('returns false when no match found', () => {
      const model = buildModel('gpt-4', 'openai', 'GPT-4')
      expect(matchesSearchQuery(model, 'openai:gpt-4', 'claude')).toBe(false)
      expect(matchesSearchQuery(model, 'openai:gpt-4', 'anthropic')).toBe(false)
    })
  })
})

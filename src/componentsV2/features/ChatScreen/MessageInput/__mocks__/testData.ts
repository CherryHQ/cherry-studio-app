import type { Assistant, Model, Provider, Topic } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'

export const createMockModel = (overrides: Partial<Model> = {}): Model => ({
  id: 'model-1',
  name: 'Test Model',
  provider: 'test-provider',
  group: 'default',
  ...overrides
})

export const createMockAssistant = (overrides: Partial<Assistant> = {}): Assistant => ({
  id: 'assistant-1',
  name: 'Test Assistant',
  prompt: 'You are a helpful assistant',
  model: createMockModel(),
  defaultModel: undefined,
  enableGenerateImage: false,
  enableWebSearch: false,
  topics: [],
  type: 'external',
  emoji: '',
  ...overrides
})

export const createMockTopic = (overrides: Partial<Topic> = {}): Topic => ({
  id: 'topic-1',
  assistantId: 'assistant-1',
  name: 'Test Topic',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isLoading: false,
  ...overrides
})

export const createMockFile = (overrides: Partial<FileMetadata> = {}): FileMetadata => ({
  id: 'file-1',
  name: 'test.txt',
  origin_name: 'test.txt',
  path: '/path/to/file',
  size: 100,
  ext: '.txt',
  type: 'text' as any,
  created_at: Date.now(),
  count: 1,
  ...overrides
})

export const createMockProvider = (overrides: Partial<Provider> = {}): Provider => ({
  id: 'provider-1',
  name: 'Test Provider',
  type: 'openai',
  apiKey: 'test-key',
  apiHost: 'https://api.test.com',
  enabled: true,
  isSystem: false,
  models: [createMockModel()],
  ...overrides
})

export const createLongText = (length: number): string => {
  return 'a'.repeat(length)
}

import OpenAI from 'openai'

import { StreamTextParams } from './aiCoretypes'
import { Chunk } from './chunk'
import { Message } from './message'
import { WebSearchProvider } from './websearch'
import { MCPServer } from './mcp'

export type Assistant = {
  id: string
  name: string
  prompt: string
  topics: Topic[]
  type: 'system' | 'built_in' | 'external'
  emoji?: string
  description?: string
  model?: Model
  defaultModel?: Model
  settings?: Partial<AssistantSettings>
  // enableUrlContext 是 Gemini 的特有功能
  enableUrlContext?: boolean
  /** enableWebSearch 代表使用模型内置网络搜索功能 */
  enableWebSearch?: boolean
  webSearchProviderId?: WebSearchProvider['id']
  enableGenerateImage?: boolean
  knowledgeRecognition?: 'off' | 'on'
  tags?: string[] // 助手标签
  group?: string[] // 助手分组
  mcpServers?: MCPServer[]
}

const ThinkModelTypes = [
  'default',
  'o',
  'gpt5',
  'grok',
  'gemini',
  'gemini_pro',
  'qwen',
  'qwen_thinking',
  'doubao',
  'doubao_no_auto',
  'hunyuan',
  'zhipu',
  'perplexity',
  'deepseek_hybrid'
] as const

export type ReasoningEffortOption = NonNullable<OpenAI.ReasoningEffort> | 'auto'
export type ThinkingOption = ReasoningEffortOption | 'off'
export type ThinkingModelType = (typeof ThinkModelTypes)[number]
export type ThinkingOptionConfig = Record<ThinkingModelType, ThinkingOption[]>
export type ReasoningEffortConfig = Record<ThinkingModelType, ReasoningEffortOption[]>
export type EffortRatio = Record<ReasoningEffortOption, number>

export function isThinkModelType(type: string): type is ThinkingModelType {
  return ThinkModelTypes.some(t => t === type)
}

export const EFFORT_RATIO: EffortRatio = {
  minimal: 0.05,
  low: 0.05,
  medium: 0.5,
  high: 0.8,
  auto: 2
}

export type AssistantSettings = {
  maxTokens?: number
  enableMaxTokens?: boolean
  temperature: number
  enableTemperature?: boolean
  topP: number
  enableTopP?: boolean
  contextCount: number
  streamOutput: boolean
  defaultModel?: Model
  customParameters?: AssistantSettingCustomParameters[]
  reasoning_effort?: ReasoningEffortOption
  /** 保留上一次使用思考模型时的 reasoning effort, 在从非思考模型切换到思考模型时恢复.
   *
   * TODO: 目前 reasoning_effort === undefined 有两个语义，有的场景是显式关闭思考，有的场景是不传参。
   * 未来应该重构思考控制，将启用/关闭思考和思考选项分离，这样就不用依赖 cache 了。
   *
   */
  reasoning_effort_cache?: ReasoningEffortOption
  qwenThinkMode?: boolean
  toolUseMode?: 'function' | 'prompt'
}

export type AssistantSettingCustomParameters = {
  name: string
  value: string | number | boolean | object
  type: 'string' | 'number' | 'boolean' | 'json'
}

export type Topic = {
  id: string
  assistantId: string
  name: string
  createdAt: number
  updatedAt: number
  isLoading?: boolean
}

export type ModelPricing = {
  input_per_million_tokens: number
  output_per_million_tokens: number
  currencySymbol?: string
}

export type ModelCapability = {
  type: ModelType
  /**
   * 是否为用户手动选择，如果为true，则表示用户手动选择了该类型，否则表示用户手动禁止了该模型；如果为undefined，则表示使用默认值
   * Is it manually selected by the user? If true, it means the user manually selected this type; otherwise, it means the user  * manually disabled the model.
   */
  isUserSelected?: boolean
}

export type Model = {
  id: string
  provider: string
  name: string
  group: string
  owned_by?: string
  description?: string
  capabilities?: ModelCapability[]
  /**
   * @deprecated
   */
  type?: ModelType[]
  pricing?: ModelPricing
  endpoint_type?: EndpointType
  supported_endpoint_types?: EndpointType[]
  supported_text_delta?: boolean
}

export type ModelHealthStatus = 'testing' | 'healthy' | 'unhealthy' | 'idle'

export type ModelHealth = {
  modelId: string
  status: ModelHealthStatus
  latency?: number // Response time in seconds
  lastChecked?: number
  error?: string
}

export type ModelType = 'text' | 'vision' | 'embedding' | 'reasoning' | 'function_calling' | 'web_search' | 'rerank'

export type Usage = OpenAI.Completions.CompletionUsage & {
  thoughts_tokens?: number
  // OpenRouter specific fields
  cost?: number
}

export type Metrics = {
  completion_tokens: number
  time_completion_millsec: number
  time_first_token_millsec?: number
  time_thinking_millsec?: number
}

// undefined 视为支持，默认支持
export type ProviderApiOptions = {
  /** 是否不支持 message 的 content 为数组类型 */
  isNotSupportArrayContent?: boolean
  /** 是否不支持 stream_options 参数 */
  isNotSupportStreamOptions?: boolean
  /**
   * @deprecated
   * 是否不支持 message 的 role 为 developer */
  isNotSupportDeveloperRole?: boolean
  /* 是否支持 message 的 role 为 developer */
  isSupportDeveloperRole?: boolean
  /**
   * @deprecated
   * 是否不支持 service_tier 参数. Only for OpenAI Models. */
  isNotSupportServiceTier?: boolean
  /* 是否支持 service_tier 参数. Only for OpenAI Models. */
  isSupportServiceTier?: boolean
  /** 是否不支持 enable_thinking 参数 */
  isNotSupportEnableThinking?: boolean
}

export type OpenAIVerbosity = 'high' | 'medium' | 'low'

export type OpenAISummaryText = 'auto' | 'concise' | 'detailed' | 'off'

export const OpenAIServiceTiers = {
  auto: 'auto',
  default: 'default',
  flex: 'flex',
  priority: 'priority'
} as const

export type OpenAIServiceTier = keyof typeof OpenAIServiceTiers

export function isOpenAIServiceTier(tier: string): tier is OpenAIServiceTier {
  return Object.hasOwn(OpenAIServiceTiers, tier)
}

export const GroqServiceTiers = {
  auto: 'auto',
  on_demand: 'on_demand',
  flex: 'flex',
  performance: 'performance'
} as const

// 从 GroqServiceTiers 对象中提取类型
export type GroqServiceTier = keyof typeof GroqServiceTiers

export function isGroqServiceTier(tier: string): tier is GroqServiceTier {
  return Object.hasOwn(GroqServiceTiers, tier)
}

export type ServiceTier = OpenAIServiceTier | GroqServiceTier

export function isServiceTier(tier: string): tier is ServiceTier {
  return isGroqServiceTier(tier) || isOpenAIServiceTier(tier)
}

export type Provider = {
  id: string
  type: ProviderType
  name: string
  apiKey: string
  apiHost: string
  apiVersion?: string
  models: Model[]
  enabled?: boolean
  isSystem?: boolean
  isAuthed?: boolean
  rateLimit?: number

  // API options
  apiOptions?: ProviderApiOptions
  serviceTier?: ServiceTier

  /** @deprecated */
  isNotSupportArrayContent?: boolean
  /** @deprecated */
  isNotSupportStreamOptions?: boolean
  /** @deprecated */
  isNotSupportDeveloperRole?: boolean
  /** @deprecated */
  isNotSupportServiceTier?: boolean

  authType?: 'apiKey' | 'oauth'
  isVertex?: boolean
  notes?: string
  extra_headers?: Record<string, string>
}

export type ProviderType =
  | 'openai'
  | 'openai-response'
  | 'anthropic'
  | 'gemini'
  | 'qwenlm'
  | 'azure-openai'
  | 'vertexai'
  | 'mistral'
  | 'aws-bedrock'

export type ApiStatus = 'idle' | 'processing' | 'success' | 'error'

export type EndpointType = 'openai' | 'openai-response' | 'anthropic' | 'gemini' | 'image-generation' | 'jina-rerank'

export const SystemProviderIds = {
  cherryin: 'cherryin',
  silicon: 'silicon',
  aihubmix: 'aihubmix',
  ocoolai: 'ocoolai',
  deepseek: 'deepseek',
  ppio: 'ppio',
  alayanew: 'alayanew',
  qiniu: 'qiniu',
  dmxapi: 'dmxapi',
  burncloud: 'burncloud',
  tokenflux: 'tokenflux',
  '302ai': '302ai',
  cephalon: 'cephalon',
  lanyun: 'lanyun',
  ph8: 'ph8',
  openrouter: 'openrouter',
  ollama: 'ollama',
  'new-api': 'new-api',
  lmstudio: 'lmstudio',
  anthropic: 'anthropic',
  openai: 'openai',
  'azure-openai': 'azure-openai',
  gemini: 'gemini',
  // vertexai: 'vertexai',
  github: 'github',
  copilot: 'copilot',
  zhipu: 'zhipu',
  yi: 'yi',
  moonshot: 'moonshot',
  baichuan: 'baichuan',
  dashscope: 'dashscope',
  stepfun: 'stepfun',
  doubao: 'doubao',
  infini: 'infini',
  minimax: 'minimax',
  groq: 'groq',
  together: 'together',
  fireworks: 'fireworks',
  nvidia: 'nvidia',
  grok: 'grok',
  hyperbolic: 'hyperbolic',
  mistral: 'mistral',
  jina: 'jina',
  perplexity: 'perplexity',
  modelscope: 'modelscope',
  xirang: 'xirang',
  hunyuan: 'hunyuan',
  'tencent-cloud-ti': 'tencent-cloud-ti',
  'baidu-cloud': 'baidu-cloud',
  gpustack: 'gpustack',
  voyageai: 'voyageai',
  'aws-bedrock': 'aws-bedrock',
  poe: 'poe'
} as const

export type SystemProviderId = keyof typeof SystemProviderIds

export const isSystemProviderId = (id: string): id is SystemProviderId => {
  return Object.hasOwn(SystemProviderIds, id)
}

export type SystemProvider = Provider & {
  id: SystemProviderId
  isSystem: true
  apiOptions?: never
}

/**
 * 判断是否为系统内置的提供商。比直接使用`provider.isSystem`更好，因为该数据字段不会随着版本更新而变化。
 * @param provider - Provider对象，包含提供商的信息
 * @returns 是否为系统内置提供商
 */
export const isSystemProvider = (provider: Provider): provider is SystemProvider => {
  return isSystemProviderId(provider.id) && !!provider.isSystem
}

export const isTranslateAssistant = (assistant: Assistant) => {
  return assistant.id === 'translate'
}

export type FetchChatCompletionOptions = {
  signal?: AbortSignal
  timeout?: number
  headers?: Record<string, string>
}

type BaseParams = {
  assistant: Assistant
  options?: FetchChatCompletionOptions
  onChunkReceived: (chunk: Chunk) => void
  topicId?: string // 添加 topicId 参数
  uiMessages?: Message[]
}

type MessagesParams = BaseParams & {
  messages: StreamTextParams['messages']
  prompt?: never
}

type PromptParams = BaseParams & {
  messages?: never
  // prompt: Just use string for convinience. Native prompt type unite more types, including messages type.
  // we craete a non-intersecting prompt type to discriminate them.
  // see https://github.com/vercel/ai/issues/8363
  prompt: string
}

export type FetchChatCompletionParams = MessagesParams | PromptParams

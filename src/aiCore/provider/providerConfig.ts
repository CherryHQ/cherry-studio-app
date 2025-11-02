import {
  formatPrivateKey,
  hasProviderConfig,
  ProviderConfigFactory,
  type ProviderId,
  type ProviderSettingsMap
} from '@cherrystudio/ai-core/provider'
import { cloneDeep } from 'lodash'

import { isOpenAIChatCompletionOnlyModel } from '@/config/models'
import { isAnthropicProvider, isAzureOpenAIProvider, isGeminiProvider, isNewApiProvider } from '@/config/providers'
import { COPILOT_DEFAULT_HEADERS } from '@/constants/copilot'
import { generateSignature } from '@/integration/cherryai/index'
import AwsBedrockService from '@/services/AwsBedrockService'
import CopilotService from '@/services/CopilotService'
import { getProviderByModel } from '@/services/ProviderService'
import VertexAIService from '@/services/VertexAIService'
import store from '@/store'
import { isSystemProvider, type Model, type Provider, SystemProviderIds } from '@/types'
import { formatApiHost, formatAzureOpenAIApiHost, formatVertexApiHost, routeToEndpoint } from '@/utils/api'

import { aihubmixProviderCreator, newApiResolverCreator, vertexAnthropicProviderCreator } from './config'
import { getAiSdkProviderId } from './factory'

/**
 * 获取轮询的API key
 * 复用legacy架构的多key轮询逻辑
 */
function getRotatedApiKey(provider: Provider): string {
  const keys = provider.apiKey.split(',').map(key => key.trim())
  const keyName = `provider:${provider.id}:last_used_key`

  if (keys.length === 1) {
    return keys[0]
  }

  const lastUsedKey = window.keyv.get(keyName)
  if (!lastUsedKey) {
    window.keyv.set(keyName, keys[0])
    return keys[0]
  }

  const currentIndex = keys.indexOf(lastUsedKey)
  const nextIndex = (currentIndex + 1) % keys.length
  const nextKey = keys[nextIndex]
  window.keyv.set(keyName, nextKey)

  return nextKey
}

/**
 * 处理特殊provider的转换逻辑
 */
function handleSpecialProviders(model: Model, provider: Provider): Provider {
  if (isNewApiProvider(provider)) {
    return newApiResolverCreator(model, provider)
  }

  if (isSystemProvider(provider)) {
    if (provider.id === 'aihubmix') {
      return aihubmixProviderCreator(model, provider)
    }
    if (provider.id === 'vertexai') {
      return vertexAnthropicProviderCreator(model, provider)
    }
  }
  return provider
}

/**
 * 主要用来对齐AISdk的BaseURL格式
 * @param provider
 * @returns
 */
function formatProviderApiHost(provider: Provider): Provider {
  const formatted = { ...provider }
  // if (formatted.anthropicApiHost) {
  //   formatted.anthropicApiHost = formatApiHost(formatted.anthropicApiHost)
  // }

  if (isAnthropicProvider(provider)) {
    const baseHost = formatted.apiHost
    formatted.apiHost = formatApiHost(baseHost)
    // if (!formatted.anthropicApiHost) {
    //   formatted.anthropicApiHost = formatted.apiHost
    // }
  } else if (formatted.id === SystemProviderIds.copilot || formatted.id === SystemProviderIds.github) {
    formatted.apiHost = formatApiHost(formatted.apiHost, false)
  } else if (isGeminiProvider(formatted)) {
    formatted.apiHost = formatApiHost(formatted.apiHost, true, 'v1beta')
  } else if (isAzureOpenAIProvider(formatted)) {
    formatted.apiHost = formatAzureOpenAIApiHost(formatted.apiHost)
  } else if (VertexAIService.isVertexProvider(formatted)) {
    formatted.apiHost = formatVertexApiHost(formatted)
  } else {
    formatted.apiHost = formatApiHost(formatted.apiHost)
  }
  return formatted
}

/**
 * 获取实际的Provider配置
 * 简化版：将逻辑分解为小函数
 */
export function getActualProvider(model: Model): Provider {
  const baseProvider = getProviderByModel(model)

  // 按顺序处理各种转换
  let actualProvider = cloneDeep(baseProvider)
  actualProvider = handleSpecialProviders(model, actualProvider)
  actualProvider = formatProviderApiHost(actualProvider)

  return actualProvider
}

/**
 * 将 Provider 配置转换为新 AI SDK 格式
 * 简化版：利用新的别名映射系统
 */
export function providerToAiSdkConfig(
  actualProvider: Provider,
  model: Model
): {
  providerId: ProviderId | 'openai-compatible'
  options: ProviderSettingsMap[keyof ProviderSettingsMap]
} {
  const aiSdkProviderId = getAiSdkProviderId(actualProvider)

  // 构建基础配置
  const { baseURL, endpoint } = routeToEndpoint(actualProvider.apiHost)
  const baseConfig = {
    baseURL: baseURL,
    apiKey: getRotatedApiKey(actualProvider)
  }

  const isCopilotProvider = actualProvider.id === SystemProviderIds.copilot
  if (isCopilotProvider) {
    const storedHeaders = store.getState().copilot.defaultHeaders ?? {}
    const options = ProviderConfigFactory.fromProvider('github-copilot-openai-compatible', baseConfig, {
      headers: {
        ...COPILOT_DEFAULT_HEADERS,
        ...storedHeaders,
        ...actualProvider.extra_headers
      },
      name: actualProvider.id,
      includeUsage: true
    })

    return {
      providerId: 'github-copilot-openai-compatible',
      options
    }
  }

  // 处理OpenAI模式
  const extraOptions: any = {}
  extraOptions.endpoint = endpoint
  if (actualProvider.type === 'openai-response' && !isOpenAIChatCompletionOnlyModel(model)) {
    extraOptions.mode = 'responses'
  } else if (aiSdkProviderId === 'openai') {
    extraOptions.mode = 'chat'
  }

  // 添加额外headers
  if (actualProvider.extra_headers) {
    extraOptions.headers = actualProvider.extra_headers
    // copy from openaiBaseClient/openaiResponseApiClient
    if (aiSdkProviderId === 'openai') {
      extraOptions.headers = {
        ...extraOptions.headers,
        'HTTP-Referer': 'https://cherry-ai.com',
        'X-Title': 'Cherry Studio',
        'X-Api-Key': baseConfig.apiKey
      }
    }
  }
  // azure
  if (aiSdkProviderId === 'azure' || actualProvider.type === 'azure-openai') {
    // extraOptions.apiVersion = actualProvider.apiVersion 默认使用v1，不使用azure endpoint
    if (actualProvider.apiVersion === 'preview') {
      extraOptions.mode = 'responses'
    } else {
      extraOptions.mode = 'chat'
    }
  }

  // bedrock - Note: credentials are loaded synchronously here for config
  // The actual async loading happens in prepareSpecialProviderConfig
  if (aiSdkProviderId === 'bedrock') {
    // Placeholder values - will be replaced in prepareSpecialProviderConfig
    extraOptions.region = 'us-east-1'
    extraOptions.accessKeyId = 'placeholder'
    extraOptions.secretAccessKey = 'placeholder'
  }
  // google-vertex - Note: credentials are loaded synchronously here for config
  // The actual async loading happens in prepareSpecialProviderConfig
  if (aiSdkProviderId === 'google-vertex' || aiSdkProviderId === 'google-vertex-anthropic') {
    // Placeholder values - will be replaced in prepareSpecialProviderConfig
    extraOptions.project = 'placeholder'
    extraOptions.location = 'us-central1'
    extraOptions.googleCredentials = {
      privateKey: 'placeholder',
      clientEmail: 'placeholder'
    }
    baseConfig.baseURL += aiSdkProviderId === 'google-vertex' ? '/publishers/google' : '/publishers/anthropic/models'
  }

  if (hasProviderConfig(aiSdkProviderId) && aiSdkProviderId !== 'openai-compatible') {
    const options = ProviderConfigFactory.fromProvider(aiSdkProviderId, baseConfig, extraOptions)
    return {
      providerId: aiSdkProviderId as ProviderId,
      options
    }
  }

  // 否则fallback到openai-compatible
  const options = ProviderConfigFactory.createOpenAICompatible(baseConfig.baseURL, baseConfig.apiKey)
  return {
    providerId: 'openai-compatible',
    options: {
      ...options,
      name: actualProvider.id,
      ...extraOptions,
      includeUsage: true
    }
  }
}

/**
 * 检查是否支持使用新的AI SDK
 * 简化版：利用新的别名映射和动态provider系统
 */
export async function isModernSdkSupported(provider: Provider): Promise<boolean> {
  // 特殊检查：vertexai需要配置完整
  if (provider.type === 'vertexai') {
    const isConfigured = await VertexAIService.isVertexAIConfigured(provider)
    if (!isConfigured) {
      return false
    }
  }

  // 使用getAiSdkProviderId获取映射后的providerId，然后检查AI SDK是否支持
  const aiSdkProviderId = getAiSdkProviderId(provider)

  // 如果映射到了支持的provider，则支持现代SDK
  return hasProviderConfig(aiSdkProviderId)
}

/**
 * 准备特殊provider的配置,主要用于异步处理的配置
 */
export async function prepareSpecialProviderConfig(
  provider: Provider,
  config: ReturnType<typeof providerToAiSdkConfig>
) {
  // Load AWS Bedrock credentials if needed
  if (config.providerId === 'bedrock' || provider.type === 'aws-bedrock') {
    const credentials = await AwsBedrockService.getAwsBedrockCredentials(provider.id)
    if (credentials) {
      config.options.region = credentials.region
      config.options.accessKeyId = credentials.accessKeyId
      config.options.secretAccessKey = credentials.secretAccessKey
    }
  }

  // Load VertexAI credentials if needed
  if (config.providerId === 'google-vertex' || config.providerId === 'google-vertex-anthropic') {
    const vertexProvider = await VertexAIService.createVertexProvider(provider)
    if (
      VertexAIService.isVertexProvider(vertexProvider) &&
      vertexProvider.googleCredentials &&
      vertexProvider.project &&
      vertexProvider.location
    ) {
      config.options.project = vertexProvider.project
      config.options.location = vertexProvider.location
      config.options.googleCredentials = {
        privateKey: formatPrivateKey(vertexProvider.googleCredentials.privateKey),
        clientEmail: vertexProvider.googleCredentials.clientEmail
      }
    }
  }

  switch (provider.id) {
    case 'copilot': {
      const defaultHeaders = store.getState().copilot.defaultHeaders ?? {}
      const headers = {
        ...COPILOT_DEFAULT_HEADERS,
        ...defaultHeaders
      }
      const { token } = await CopilotService.getToken(headers)
      config.options.apiKey = token
      config.options.headers = {
        ...headers,
        ...config.options.headers
      }
      break
    }
    case 'cherryai': {
      config.options.fetch = async (url, options) => {
        // 在这里对最终参数进行签名
        const signature = generateSignature({
          method: 'POST',
          path: '/chat/completions',
          query: '',
          body: JSON.parse(options.body)
        })
        return fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            ...signature
          }
        })
      }
      break
    }
    case 'anthropic': {
      if (provider.authType === 'oauth') {
        const oauthToken = await window.api.anthropic_oauth.getAccessToken()
        config.options = {
          ...config.options,
          headers: {
            ...(config.options.headers ? config.options.headers : {}),
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'oauth-2025-04-20',
            Authorization: `Bearer ${oauthToken}`
          },
          baseURL: 'https://api.anthropic.com/v1',
          apiKey: ''
        }
      }
    }
  }
  return config
}

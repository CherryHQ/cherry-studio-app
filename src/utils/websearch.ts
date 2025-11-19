import type {
  AnthropicSearchConfig,
  OpenAISearchConfig,
  WebSearchPluginConfig
} from '@cherrystudio/ai-core/built-in/plugins'
import type { BaseProviderId } from '@cherrystudio/ai-core/provider'

import { isOpenAIDeepResearchModel } from '@/config/models'
import type { Model } from '@/types/assistant'
import type { CherryWebSearchConfig } from '@/types/websearch'

/**
 * 用于展示一些常用的网站名
 */
const WEBSITE_BRAND: Record<string, string> = {
  google: 'Google',
  apple: 'Apple',
  wikipedia: 'Wikipedia',
  facebook: 'FaceBook',
  baidu: 'Baidu',
  bing: 'Bing',
  x: 'X',
  twitter: 'Twitter',
  default: 'Web'
}

export function getWebsiteBrand(url: string): string {
  try {
    const { hostname } = new URL(url)

    for (const brand in WEBSITE_BRAND) {
      if (brand === 'default') continue

      const regex = new RegExp(`\\b${brand}\\b`, 'i')

      if (regex.test(hostname)) {
        return WEBSITE_BRAND[brand]
      }
    }
  } catch {
    return WEBSITE_BRAND.default
  }

  return WEBSITE_BRAND.default
}

export function buildProviderBuiltinWebSearchConfig(
  providerId: BaseProviderId,
  webSearchConfig: CherryWebSearchConfig,
  model?: Model
): WebSearchPluginConfig | undefined {
  switch (providerId) {
    case 'openai': {
      const searchContextSize = isOpenAIDeepResearchModel(model)
        ? 'medium'
        : mapMaxResultToOpenAIContextSize(webSearchConfig.maxResults)
      return {
        openai: {
          searchContextSize
        }
      }
    }
    case 'openai-chat': {
      const searchContextSize = isOpenAIDeepResearchModel(model)
        ? 'medium'
        : mapMaxResultToOpenAIContextSize(webSearchConfig.maxResults)
      return {
        'openai-chat': {
          searchContextSize
        }
      }
    }
    case 'anthropic': {
      // const blockedDomains = mapRegexToPatterns(webSearchConfig.excludeDomains)
      const anthropicSearchOptions: AnthropicSearchConfig = {
        maxUses: webSearchConfig.maxResults,
        blockedDomains: undefined
      }
      return {
        anthropic: anthropicSearchOptions
      }
    }
    case 'xai': {
      // const excludeDomains = mapRegexToPatterns(webSearchConfig.excludeDomains)
      return {
        xai: {
          maxSearchResults: webSearchConfig.maxResults,
          returnCitations: true,
          sources: [
            {
              type: 'web'
              // excludedWebsites: excludeDomains.slice(0, Math.min(excludeDomains.length, 5))
            },
            { type: 'news' },
            { type: 'x' }
          ],
          mode: 'on'
        }
      }
    }
    case 'openrouter': {
      return {
        openrouter: {
          plugins: [
            {
              id: 'web',
              max_results: webSearchConfig.maxResults
            }
          ]
        }
      }
    }
    case 'cherryin': {
      const _providerId =
        { 'openai-response': 'openai', openai: 'openai-chat' }[model?.endpoint_type ?? ''] ?? model?.endpoint_type
      return buildProviderBuiltinWebSearchConfig(_providerId, webSearchConfig, model)
    }
    default: {
      return {}
    }
  }
}

/**
 * range in [0, 100]
 * @param maxResults
 */
function mapMaxResultToOpenAIContextSize(maxResults: number): OpenAISearchConfig['searchContextSize'] {
  if (maxResults <= 33) return 'low'
  if (maxResults <= 66) return 'medium'
  return 'high'
}

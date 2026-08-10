import type { WebSearchPluginConfig } from '@cherrystudio/ai-core/built-in/plugins';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { Model } from '@cherrystudio/universal/data/types/model';
import {
  isOpenAIDeepResearchModel,
  isOpenAIWebSearchChatCompletionOnlyModel,
} from '@cherrystudio/universal/utils/model';

import type { AppProviderId } from '../types';

/** Inputs for provider-builtin web-search plugin configuration. */
export interface CherryWebSearchConfig {
  maxResults: number;
  excludeDomains: string[];
}

export function getWebSearchParams(model: Model): Record<string, unknown> {
  if (model.providerId === 'hunyuan') {
    return { enable_enhancement: true, citation: true, search_info: true };
  }

  if (model.providerId === 'dashscope') {
    const apiModelId = model.apiModelId ?? model.id;
    const needsAgentStrategy = /qwen3-max|omni|qwen3-vl/.test(apiModelId);
    return {
      enable_search: true,
      search_options: {
        forced_search: true,
        ...(needsAgentStrategy ? { search_strategy: 'agent' } : {}),
      },
    };
  }

  if (model.providerId === 'poe') {
    return {
      extra_body: {
        web_search: true,
      },
    };
  }

  if (isOpenAIWebSearchChatCompletionOnlyModel(model)) {
    return {
      web_search_options: {},
    };
  }

  return {};
}

function servesResponsesWebSearch(model: Model): boolean {
  // Bailian serves the Responses web_search tool only for the Qwen 3.x line.
  return /^qwen3[.-]/.test(model.apiModelId ?? '');
}

/**
 * Ported subset of desktop's `@shared/utils/blacklistMatchPattern`'s
 * `mapRegexToPatterns` — extracts bare domains from user-entered blocklist
 * entries (plain domains, `https://...` URLs, or `/regex/`-wrapped patterns)
 * for providers whose web-search tool takes a domain blocklist.
 */
export function mapRegexToPatterns(patterns: string[]): string[] {
  const patternSet = new Set<string>();
  const domainMatcher = /[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

  patterns.forEach((pattern) => {
    if (!pattern) return;

    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const rawPattern = pattern.slice(1, -1);
      const normalizedPattern = rawPattern.replace(/\\\./g, '.').replace(/\\\//g, '/');
      const matches = normalizedPattern.match(domainMatcher);
      matches?.forEach((match) => {
        patternSet.add(match.replace(/http(s)?:\/\//g, '').toLowerCase());
      });
    } else if (pattern.includes('://')) {
      const matches = pattern.match(domainMatcher);
      matches?.forEach((match) => {
        patternSet.add(match.replace(/http(s)?:\/\//g, '').toLowerCase());
      });
    } else {
      patternSet.add(pattern.toLowerCase());
    }
  });

  return Array.from(patternSet);
}

/**
 * range in [0, 100]
 */
function mapMaxResultToOpenAIContextSize(
  maxResults: number,
): NonNullable<WebSearchPluginConfig['openai']>['searchContextSize'] {
  if (maxResults <= 33) return 'low';
  if (maxResults <= 66) return 'medium';
  return 'high';
}

export function buildProviderBuiltinWebSearchConfig(
  providerId: AppProviderId,
  webSearchConfig: CherryWebSearchConfig,
  model?: Model,
): WebSearchPluginConfig | undefined {
  switch (providerId) {
    case 'azure-responses':
    case 'openai': {
      if (model?.providerId === 'doubao') {
        return { openai: {} };
      }
      if (model?.providerId === 'dashscope') {
        // `undefined` suppresses the plugin; `{}` would still attach a provider tool.
        return servesResponsesWebSearch(model) ? { openai: {} } : undefined;
      }
      const searchContextSize =
        model && isOpenAIDeepResearchModel(model)
          ? 'medium'
          : mapMaxResultToOpenAIContextSize(webSearchConfig.maxResults);
      return {
        openai: {
          searchContextSize,
        },
      };
    }
    case 'openai-chat': {
      const searchContextSize =
        model && isOpenAIDeepResearchModel(model)
          ? 'medium'
          : mapMaxResultToOpenAIContextSize(webSearchConfig.maxResults);
      return {
        'openai-chat': {
          searchContextSize,
        },
      };
    }
    case 'anthropic': {
      const blockedDomains = mapRegexToPatterns(webSearchConfig.excludeDomains);
      const anthropicSearchOptions: NonNullable<WebSearchPluginConfig['anthropic']> = {
        maxUses: webSearchConfig.maxResults,
        blockedDomains: blockedDomains.length > 0 ? blockedDomains : undefined,
      };
      return {
        anthropic: anthropicSearchOptions,
      };
    }
    case 'xai':
    case 'xai-responses': {
      const excludeDomains = mapRegexToPatterns(webSearchConfig.excludeDomains);
      const xaiWebConfig: NonNullable<
        NonNullable<WebSearchPluginConfig['xai-responses']>['webSearch']
      > = {
        enableImageUnderstanding: true,
      };
      if (excludeDomains.length > 0) {
        xaiWebConfig.excludedDomains = excludeDomains.slice(0, 5);
      }
      return {
        'xai-responses': {
          webSearch: xaiWebConfig,
          xSearch: { enableImageUnderstanding: true },
        },
      };
    }
    case 'openrouter': {
      return {
        openrouter: {
          plugins: [
            {
              id: 'web',
              max_results: webSearchConfig.maxResults,
            },
          ],
        },
      };
    }
    case 'cherryin': {
      // cherryin proxies to a real endpoint forced via model.endpointTypes[0];
      // map it to the AppProviderId whose web-search case applies.
      const endpoint = model?.endpointTypes?.[0];
      const proxied: AppProviderId | undefined =
        endpoint === ENDPOINT_TYPE.OPENAI_RESPONSES
          ? 'openai'
          : endpoint === ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS
            ? 'openai-chat'
            : endpoint === ENDPOINT_TYPE.ANTHROPIC_MESSAGES
              ? 'anthropic'
              : endpoint;
      return proxied ? buildProviderBuiltinWebSearchConfig(proxied, webSearchConfig, model) : {};
    }
    default: {
      return {};
    }
  }
}

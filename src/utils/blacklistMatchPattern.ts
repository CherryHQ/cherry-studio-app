import type { WebSearchProviderResponse, WebSearchState } from '@/types/websearch'

export async function filterResultWithBlacklist(
  response: WebSearchProviderResponse,
  _websearch: WebSearchState
): Promise<WebSearchProviderResponse> {
  // 黑名单功能已移除，直接返回原始结果
  return response
}

export function mapRegexToPatterns(patterns: string[]): string[] {
  const patternSet = new Set<string>()
  const domainMatcher = /[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g

  patterns.forEach(pattern => {
    if (!pattern) {
      return
    }

    // Handle regex patterns (wrapped in /)
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const rawPattern = pattern.slice(1, -1)
      const normalizedPattern = rawPattern.replace(/\\\./g, '.').replace(/\\\//g, '/')
      const matches = normalizedPattern.match(domainMatcher)

      if (matches) {
        matches.forEach(match => {
          patternSet.add(match.replace(/http(s)?:\/\//g, '').toLowerCase())
        })
      }
    } else if (pattern.includes('://')) {
      // Handle URLs with protocol (e.g., https://baidu.com)
      const matches = pattern.match(domainMatcher)
      if (matches) {
        matches.forEach(match => {
          patternSet.add(match.replace(/http(s)?:\/\//g, '').toLowerCase())
        })
      }
    } else {
      patternSet.add(pattern.toLowerCase())
    }
  })

  return Array.from(patternSet)
}

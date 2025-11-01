import { WebSearchState, WebSearchProviderResponse } from '@/types/websearch'

export async function filterResultWithBlacklist(
  response: WebSearchProviderResponse,
  _websearch: WebSearchState
): Promise<WebSearchProviderResponse> {
  // 黑名单功能已移除，直接返回原始结果
  return response
}

import type { WebSearchProviderResponse } from '@/types/websearch'

import BaseWebSearchProvider from './BaseWebSearchProvider'

export default class DefaultProvider extends BaseWebSearchProvider {
  search(): Promise<WebSearchProviderResponse> {
    throw new Error('Method not implemented.')
  }
}

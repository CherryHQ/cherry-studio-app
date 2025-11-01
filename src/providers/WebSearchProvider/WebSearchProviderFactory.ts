import type { WebSearchProvider } from '@/types/websearch'

import type BaseWebSearchProvider from './BaseWebSearchProvider'
import BochaProvider from './BochaProvider'
import DefaultProvider from './DefaultProvider'
import ExaProvider from './ExaProvider'
import TavilyProvider from './TavilyProvider'
import ZhipuProvider from './ZhipuProvider'
// import LocalBaiduProvider from './LocalBaiduProvider'
// import LocalBingProvider from './LocalBingProvider'
// import LocalGoogleProvider from './LocalGoogleProvider'
// import SearxngProvider from './SearxngProvider'

export default class WebSearchProviderFactory {
  static create(provider: WebSearchProvider): BaseWebSearchProvider {
    switch (provider.id) {
      case 'tavily':
        return new TavilyProvider(provider)
      case 'bocha':
        return new BochaProvider(provider)
      case 'exa':
        return new ExaProvider(provider)
      case 'zhipu':
        return new ZhipuProvider(provider)
      // case 'searxng':
      //   return new SearxngProvider(provider)
      // case 'local-baidu':
      //   return new LocalBaiduProvider(provider)
      // case 'local-google':
      //   return new LocalGoogleProvider(provider)
      // case 'local-bing':
      //   return new LocalBingProvider(provider)
      default:
        return new DefaultProvider(provider)
    }
  }
}

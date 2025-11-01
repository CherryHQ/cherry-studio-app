import type { WebSearchProvider } from '@/types/websearch'

export function getWebSearchProviders(): WebSearchProvider[] {
  return [
    {
      id: 'builtin',
      name: 'Built-in',
      type: 'builtin'
    },
    {
      id: 'tavily',
      name: 'Tavily',
      type: 'api',
      apiHost: 'https://api.tavily.com',
      apiKey: ''
    },
    {
      id: 'exa',
      name: 'Exa',
      type: 'api',
      apiHost: 'https://api.exa.ai',
      apiKey: ''
    },
    {
      id: 'bocha',
      name: 'Bocha',
      type: 'api',
      apiHost: 'https://api.bochaai.com',
      apiKey: ''
    },
    {
      id: 'searxng',
      name: 'Searxng',
      type: 'free',
      apiHost: '',
      basicAuthUsername: '',
      basicAuthPassword: ''
    },
    {
      id: 'local-google',
      name: 'Google',
      type: 'free',
      url: 'https://www.google.com/search?q=%s'
    },
    {
      id: 'local-bing',
      name: 'Bing',
      type: 'free',
      url: 'https://cn.bing.com/search?q=%s&ensearch=1'
    },
    {
      id: 'local-baidu',
      name: 'Baidu',
      type: 'free',
      url: 'https://www.baidu.com/s?wd=%s'
    }
  ]
}

export const WEB_SEARCH_PROVIDER_CONFIG = {
  tavily: {
    websites: {
      official: 'https://tavily.com',
      apiKey: 'https://app.tavily.com/home'
    }
  },
  searxng: {
    websites: {
      official: 'https://docs.searxng.org'
    }
  },
  exa: {
    websites: {
      official: 'https://exa.ai',
      apiKey: 'https://dashboard.exa.ai/api-keys'
    }
  },
  bocha: {
    websites: {
      official: 'https://bochaai.com',
      apiKey: 'https://open.bochaai.com/overview'
    }
  },
  'local-google': {
    websites: {
      official: 'https://www.google.com'
    }
  },
  'local-bing': {
    websites: {
      official: 'https://www.bing.com'
    }
  },
  'local-baidu': {
    websites: {
      official: 'https://www.baidu.com'
    }
  }
}

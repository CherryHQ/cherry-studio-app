import type { SpeechToTextProvider } from '@/types/speechToText'

export function getSpeechToTextProviders(): SpeechToTextProvider[] {
  return [
    {
      id: 'default',
      name: 'Default',
      type: 'builtin'
    },
    {
      id: 'bailian',
      name: 'Bailian',
      type: 'api',
      apiHost: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
      apiKey: ''
    }
  ]
}

export const SPEECH_TO_TEXT_PROVIDER_CONFIG = {
  bailian: {
    websites: {
      official: 'https://www.aliyun.com/product/bailian',
      apiKey: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
      docs: 'https://help.aliyun.com/zh/model-studio/getting-started/'
    }
  }
}

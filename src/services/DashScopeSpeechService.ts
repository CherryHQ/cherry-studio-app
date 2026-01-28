import OpenAI from 'openai'

import { loggerService } from '@/services/LoggerService'
import type { SpeechToTextProvider } from '@/types/speechToText'

const logger = loggerService.withContext('DashScopeSpeechService')

export interface SpeechRecognitionOptions {
  language?: string
  enableITN?: boolean
}

export class DashScopeSpeechService {
  private client: OpenAI | null = null
  private provider: SpeechToTextProvider

  constructor(provider: SpeechToTextProvider) {
    this.provider = provider
    if (provider.apiKey) {
      this.client = new OpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.apiHost || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
      })
    }
  }

  async recognize(audioData: string, options: SpeechRecognitionOptions = {}): Promise<string> {
    if (!this.client) {
      throw new Error('DashScope client not initialized. API key is required.')
    }

    try {
      const dataUri = `data:audio/mpeg;base64,${audioData}`

      logger.info('Starting speech recognition with API', {
        model: 'qwen3-asr-flash',
        language: options.language || 'zh',
        enableITN: options.enableITN || false,
        audioDataLength: audioData.length,
        dataUriPrefix: dataUri.substring(0, 50)
      })

      const completion = await this.client.chat.completions.create({
        model: 'qwen3-asr-flash',
        messages: [
          {
            role: 'system',
            content: [{ text: '' }]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_audio' as any,
                input_audio: {
                  data: dataUri
                }
              }
            ]
          }
        ],
        stream: false
      } as any)

      logger.info('Full API response:', {
        choicesLength: completion.choices.length,
        fullChoice: completion.choices[0],
        message: completion.choices[0]?.message,
        content: completion.choices[0]?.message?.content,
        contentType: typeof completion.choices[0]?.message?.content,
        contentLength: completion.choices[0]?.message?.content?.length,
        messageKeys: Object.keys(completion.choices[0]?.message || {}),
        usage: completion.usage,
        fullCompletion: JSON.stringify(completion).substring(0, 500)
      })

      const message = completion.choices[0]?.message
      let result = ''

      if (typeof message?.content === 'string') {
        result = message.content
      } else if (Array.isArray(message?.content)) {
        result = message.content.map((item: any) => {
          if (typeof item === 'string') return item
          if (item?.text) return item.text
          if (item?.type === 'text') return item.text
          return ''
        }).join('')
      } else if (message?.content) {
        result = JSON.stringify(message.content)
      }

      logger.info('Speech recognition completed', { result: result.substring(0, 100) + '...', resultLength: result.length })
      return result
    } catch (error) {
      logger.error('Speech recognition failed:', error as Error)
      throw error
    }
  }

  async recognizeFromFile(uri: string, options: SpeechRecognitionOptions = {}): Promise<string> {
    try {
      logger.info('Reading audio file from URI:', uri)

      const response = await fetch(uri)
      const blob = await response.blob()

      logger.info('Audio file info:', {
        type: blob.type,
        size: blob.size
      })

      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          const base64 = result.split(',')[1]
          logger.info('Base64 data length:', base64.length)
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      logger.info('Starting recognition with base64 data length:', base64data.length)
      return this.recognize(base64data, options)
    } catch (error) {
      logger.error('Failed to read audio file:', error as Error)
      throw error
    }
  }

  async checkConnection(): Promise<{ valid: boolean; error?: any }> {
    if (!this.client) {
      return { valid: false, error: new Error('API key is required') }
    }

    try {
      const silentAudio =
        'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWgAAAA0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWgAAAA0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

      await this.recognize(silentAudio, { language: 'zh' })
      logger.info('API key validation successful')
      return { valid: true, error: undefined }
    } catch (error) {
      logger.error('API key validation failed:', error as Error)
      return { valid: false, error }
    }
  }
}

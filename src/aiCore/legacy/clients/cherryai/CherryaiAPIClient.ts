import OpenAI from 'openai'

import { OpenAISdkParams, OpenAISdkRawOutput } from '@/types/sdk'

import { OpenAIAPIClient } from '../openai/OpenAIApiClient'

export class CherryinAPIClient extends OpenAIAPIClient {
  override async createCompletions(
    payload: OpenAISdkParams,
    options?: OpenAI.RequestOptions
  ): Promise<OpenAISdkRawOutput> {
    const sdk = await this.getSdkInstance()
    options = options || {}
    options.headers = options.headers || {}

    // const signature = await window.api.cherryin.generateSignature({
    //   method: 'POST',
    //   path: '/chat/completions',
    //   query: '',
    //   body: payload
    // })

    options.headers = {
      ...options.headers
      // ...signature
    }

    // @ts-ignore - SDK参数可能有额外的字段
    return await sdk.chat.completions.create(payload, options)
  }

  override getClientCompatibilityType(): string[] {
    return ['CherryinAPIClient']
  }

  public async listModels(): Promise<OpenAI.Models.Model[]> {
    const models = ['glm-4.5-flash', 'Qwen/Qwen3-8B']

    const created = Date.now()
    return models.map(id => ({
      id,
      owned_by: 'cherryin',
      object: 'model' as const,
      created
    }))
  }
}

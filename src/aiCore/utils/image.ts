import type { Model, Provider } from '@/types/assistant'
import { isSystemProvider, SystemProviderIds } from '@/types/assistant'

export function buildGeminiGenerateImageParams(): Record<string, any> {
  return {
    responseModalities: ['TEXT', 'IMAGE']
  }
}

export function isOpenRouterGeminiGenerateImageModel(model: Model, provider: Provider): boolean {
  return (
    model.id.includes('gemini-2.5-flash-image') &&
    isSystemProvider(provider) &&
    provider.id === SystemProviderIds.openrouter
  )
}

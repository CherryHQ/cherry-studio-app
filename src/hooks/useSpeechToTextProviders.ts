import { usePreference } from '@/hooks/usePreference'
import { getSpeechToTextProviders } from '@/config/speechToTextProviders'
import type { SpeechToTextProvider } from '@/types/speechToText'

export function useSpeechToTextProviders() {
  const [providersConfig] = usePreference('speechToTextProviders' as any)

  const providers = getSpeechToTextProviders()

  const providersWithConfig: SpeechToTextProvider[] = providers.map(provider => {
    const config = providersConfig?.[provider.id]
    return {
      ...provider,
      apiKey: config?.apiKey || ''
    }
  })

  return {
    providers: providersWithConfig,
    apiProviders: providersWithConfig.filter(p => p.type === 'api')
  }
}

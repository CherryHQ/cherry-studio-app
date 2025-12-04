import { isEmpty } from 'lodash'

import type { Provider } from '@/types/assistant'

/**
 * Check if a provider has a valid API key configured.
 * Some providers (ollama, lmstudio, vertexai, copilot, cherryai) don't require API keys.
 */
export function hasApiKey(provider: Provider) {
  if (!provider) return false
  if (['ollama', 'lmstudio', 'vertexai', 'copilot', 'cherryai'].includes(provider.id)) return true
  return !isEmpty(provider.apiKey)
}

import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import type { WebSearchProviderId } from '@cherrystudio/universal/data/preference';

export function resolveWebSearchProviderIcon(providerId: WebSearchProviderId) {
  if (providerId === 'fetch') {
    return resolveProviderIcon('cherryin');
  }

  if (providerId === 'exa-mcp') {
    return resolveProviderIcon('exa') ?? resolveProviderIcon('mcp');
  }

  return resolveProviderIcon(providerId);
}

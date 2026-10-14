import { type IconSource, resolveProviderIcon } from '@cherrystudio/ui/icons';

import type { WebSearchProviderId } from '@/shared/data/types/webSearch';

const APP_LOGO = require('@/assets/cherry-studio-logo.png');
const LOCAL_FETCH_ICON: IconSource = { light: APP_LOGO, dark: APP_LOGO };

export function resolveWebSearchProviderIcon(providerId: WebSearchProviderId) {
  if (providerId === 'fetch') {
    return LOCAL_FETCH_ICON;
  }

  if (providerId === 'exa-mcp') {
    return resolveProviderIcon('exa') ?? resolveProviderIcon('mcp');
  }

  return resolveProviderIcon(providerId);
}

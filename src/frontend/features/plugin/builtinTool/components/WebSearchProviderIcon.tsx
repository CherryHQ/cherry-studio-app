import { Image } from '@cherrystudio/ui/components';
import { useUniwind } from 'uniwind';

import type { WebSearchProviderId } from '@/shared/data/types/webSearch';

import { resolveWebSearchProviderIcon } from '../utils/providerIcons';

export function WebSearchProviderIcon({ providerId }: { providerId: WebSearchProviderId }) {
  const { theme } = useUniwind();
  const providerIcon =
    resolveWebSearchProviderIcon(providerId)?.[theme === 'dark' ? 'dark' : 'light'];

  return providerIcon ? (
    <Image
      cachePolicy="memory-disk"
      className="size-5 shrink-0"
      contentFit="contain"
      recyclingKey={providerId}
      source={providerIcon}
    />
  ) : null;
}

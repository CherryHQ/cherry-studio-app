import {
  BackgroundPressExclusion,
  Button,
  ContextMenuExclusion,
} from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { MessageListItem } from '@/frontend/components/Message';
import { useProviders } from '@/frontend/hooks/chat/useProvider';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import { quotaFailureProviderIds } from '../utils/quotaFailureProviders';

/** Mounted by the local chat screen; remote accounts never consult local provider IDs. */
export function LocalQuotaRecovery({ message }: { message: MessageListItem }) {
  const providerIds = quotaFailureProviderIds(message);
  return providerIds.length ? <LocalProviderBillingActions providerIds={providerIds} /> : null;
}

function LocalProviderBillingActions({ providerIds }: { providerIds: readonly string[] }) {
  const { t } = useTranslation();
  const { providers } = useProviders();
  const eligible = providers.filter(
    (provider) => providerIds.includes(provider.id) && provider.websites?.billing,
  );
  if (!eligible.length) return null;
  return (
    <BackgroundPressExclusion>
      <ContextMenuExclusion className="flex-row flex-wrap gap-2">
        {eligible.map((provider) => (
          <Button
            key={provider.id}
            onPress={() => void openExternalUrl(provider.websites!.billing!)}
            size="sm"
            variant="outline"
          >
            {t('chat.errorPart.billing', { provider: provider.name })}
          </Button>
        ))}
      </ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}

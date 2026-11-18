import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

/** Capability settings refer to the model provider instead of owning another copy of its keys. */
export function ProviderCredentialsLink({
  providerId,
  providerName,
}: {
  providerId: string;
  providerName: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Section.Item
      description={t('settings.provider.sharedCredentials', { provider: providerName })}
      label={t('settings.provider.apiService.apiKeys')}
      onPress={() =>
        router.push({
          pathname: '/settings/provider/[providerId]',
          params: { providerId, providerName },
        })
      }
    />
  );
}

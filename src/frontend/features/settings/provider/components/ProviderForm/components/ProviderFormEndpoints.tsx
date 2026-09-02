import { Input } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { EndpointType } from '@/shared/data/types/model';

import { useProviderForm } from '../context';

/**
 * The provider's primary URL. Which endpoint that is stays fixed for the life of
 * the form — marking another endpoint as the chat default must not move the
 * field the user is typing in.
 */
export function ProviderFormBaseUrl() {
  const { t } = useTranslation();
  const { meta } = useProviderForm('ProviderForm.BaseUrl');

  if (!meta.baseUrlEndpoint) {
    return null;
  }

  return (
    <ProviderFormEndpointField
      endpoint={meta.baseUrlEndpoint}
      label={t('settings.provider.apiService.baseUrl')}
    />
  );
}

ProviderFormBaseUrl.displayName = 'ProviderForm.BaseUrl';

function ProviderFormEndpointField({ endpoint, label }: { endpoint: EndpointType; label: string }) {
  const { actions, meta, state } = useProviderForm('ProviderForm.BaseUrl');
  const value = state.endpointUrls[endpoint] ?? '';

  return (
    <Input
      accessibilityLabel={label}
      autoCapitalize="none"
      autoCorrect={false}
      disabled={meta.isSubmitting}
      keyboardType="url"
      onChangeText={(next) => actions.setEndpointUrl(endpoint, next)}
      placeholder={label}
      value={value}
    />
  );
}

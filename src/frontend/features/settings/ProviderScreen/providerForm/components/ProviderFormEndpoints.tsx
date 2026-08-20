import { Input } from '@cherrystudio/ui/components';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import { useTranslation } from 'react-i18next';

import { useProviderForm } from '../context';
import { ProviderFormField } from './ProviderFormField';

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
      required
    />
  );
}

ProviderFormBaseUrl.displayName = 'ProviderForm.BaseUrl';

function ProviderFormEndpointField({
  endpoint,
  label,
  required,
}: {
  endpoint: EndpointType;
  label: string;
  required?: boolean;
}) {
  const { t } = useTranslation();
  const { actions, state } = useProviderForm('ProviderForm.BaseUrl');
  const value = state.endpointUrls[endpoint] ?? '';

  return (
    <ProviderFormField label={label} required={required}>
      <Input
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onChangeText={(next) => actions.setEndpointUrl(endpoint, next)}
        placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
        value={value}
      />
    </ProviderFormField>
  );
}

import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { Input } from '@cherrystudio/ui/components';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ProviderDefaultEndpointControl } from '../../apiService';
import { isCustomProviderTextEndpointType } from '../../apiService/utils/providerApiServiceEndpointRules';
import { useProviderForm } from '../context';
import { ProviderFormField } from './ProviderFormField';

const ENDPOINT_LABEL_KEYS: Partial<Record<EndpointType, string>> = {
  [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'settings.provider.add.endpoint.openaiChatCompletions',
  [ENDPOINT_TYPE.OPENAI_RESPONSES]: 'settings.provider.add.endpoint.openaiResponses',
  [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: 'settings.provider.add.endpoint.anthropic',
  [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: 'settings.provider.add.endpoint.gemini',
  [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: 'settings.provider.add.endpoint.imageGeneration',
  [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT]: 'settings.provider.add.endpoint.imageEdit',
};

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

/** Every other endpoint this provider can point somewhere else. */
export function ProviderFormEndpoints() {
  const { t } = useTranslation();
  const { meta } = useProviderForm('ProviderForm.Endpoints');

  if (meta.secondaryEndpointTypes.length === 0) {
    return null;
  }

  return (
    <View className="gap-4">
      <Text className="font-medium text-foreground text-sm">
        {t('settings.provider.apiService.moreEndpoints')}
      </Text>
      {meta.secondaryEndpointTypes.map((endpoint) => (
        <ProviderFormEndpointField
          endpoint={endpoint}
          key={endpoint}
          label={endpointLabel(endpoint, t)}
        />
      ))}
    </View>
  );
}

ProviderFormEndpoints.displayName = 'ProviderForm.Endpoints';

function endpointLabel(endpoint: EndpointType, t: (key: string) => string): string {
  const labelKey = ENDPOINT_LABEL_KEYS[endpoint];

  return labelKey ? t(labelKey) : endpoint;
}

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
  const { actions, meta, state } = useProviderForm('ProviderForm.BaseUrl');
  const value = state.endpointUrls[endpoint] ?? '';

  return (
    <ProviderFormField
      label={label}
      labelAccessory={
        // Only text endpoints can be the chat default; image ones have no say.
        isCustomProviderTextEndpointType(endpoint) ? (
          <ProviderDefaultEndpointControl
            endpoint={endpoint}
            endpointLabel={label}
            isDefault={endpoint === state.defaultChatEndpoint}
            isDisabled={meta.isSubmitting}
            isSelectable={Boolean(value.trim())}
            onChange={actions.setDefaultChatEndpoint}
          />
        ) : undefined
      }
      required={required}
    >
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

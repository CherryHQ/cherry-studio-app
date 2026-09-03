import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import { Button, Input, TextField } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { EndpointType } from '@/shared/data/types/model';

import {
  CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES,
  type CustomProviderTextEndpoint,
  getCustomProviderEndpointRequestPreview,
  getConfiguredCustomProviderTextEndpoints,
  hasConfiguredCustomProviderTextEndpoint,
  isValidEndpointBaseUrl,
} from '../../../apiService/utils/providerApiServiceEndpointRules';
import { useProviderForm } from '../context';

const COMMON_TEXT_ENDPOINTS = CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES.slice(0, 2);
const ADVANCED_TEXT_ENDPOINTS = CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES.slice(2);

const endpointLabelKeys = {
  'anthropic-messages': 'settings.provider.apiService.endpointAnthropic',
  'google-generate-content': 'settings.provider.apiService.endpointGemini',
  'openai-chat-completions': 'settings.provider.apiService.endpointOpenAiChat',
  'openai-responses': 'settings.provider.apiService.endpointOpenAiResponses',
} as const satisfies Record<CustomProviderTextEndpoint, string>;

/** The single primary URL used by preset and IAM-backed provider forms. */
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

/** Four Pi text endpoints for a fully custom provider. */
export function ProviderFormTextEndpoints() {
  const { t } = useTranslation();
  const { meta, state } = useProviderForm('ProviderForm.Endpoints');
  const [showsAdvancedEndpoints, setShowsAdvancedEndpoints] = useState(() =>
    ADVANCED_TEXT_ENDPOINTS.some((endpointType) =>
      Boolean(state.endpointUrls[endpointType]?.trim()),
    ),
  );
  const configuredEndpoints = getConfiguredCustomProviderTextEndpoints(state.endpointUrls);
  const configuredAdvancedCount = ADVANCED_TEXT_ENDPOINTS.filter((endpointType) =>
    Boolean(state.endpointUrls[endpointType]?.trim()),
  ).length;
  const defaultEndpointLabel = t(
    endpointLabelKeys[state.defaultChatEndpoint as CustomProviderTextEndpoint],
  );
  const hasConfiguredEndpoint = hasConfiguredCustomProviderTextEndpoint(state.endpointUrls);

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="font-medium text-base text-foreground">
          {t('settings.provider.apiService.textEndpointsTitle')}
        </Text>
        <Text className="text-muted-foreground text-xs">
          {t('settings.provider.apiService.sharedApiKeyDescription')}
        </Text>
      </View>

      {COMMON_TEXT_ENDPOINTS.map((endpointType) => (
        <ProviderFormTextEndpointField endpoint={endpointType} key={endpointType} />
      ))}

      <Button
        accessibilityLabel={t('settings.provider.apiService.moreEndpoints')}
        disabled={meta.isSubmitting}
        onPress={() => setShowsAdvancedEndpoints((current) => !current)}
        size="field"
        variant="secondary"
      >
        <Button.Label numberOfLines={1}>
          {t('settings.provider.apiService.moreEndpointsConfigured', {
            count: configuredAdvancedCount,
          })}
        </Button.Label>
        {showsAdvancedEndpoints ? (
          <ChevronUpIcon className="size-4 text-foreground" />
        ) : (
          <ChevronDownIcon className="size-4 text-foreground" />
        )}
      </Button>

      {showsAdvancedEndpoints
        ? ADVANCED_TEXT_ENDPOINTS.map((endpointType) => (
            <ProviderFormTextEndpointField endpoint={endpointType} key={endpointType} />
          ))
        : null}

      {meta.defaultEndpointNeedsRepair && configuredEndpoints.length > 0 ? (
        <Text className="text-warning text-xs">
          {t('settings.provider.apiService.defaultEndpointRepair', {
            endpoint: defaultEndpointLabel,
          })}
        </Text>
      ) : null}
      {meta.hasEditedEndpointUrls && !hasConfiguredEndpoint ? (
        <Text className="text-destructive text-xs">
          {t('settings.provider.apiService.textEndpointRequired')}
        </Text>
      ) : null}
    </View>
  );
}

ProviderFormTextEndpoints.displayName = 'ProviderForm.Endpoints';

function ProviderFormTextEndpointField({ endpoint }: { endpoint: CustomProviderTextEndpoint }) {
  const { t } = useTranslation();
  const { actions, meta, state } = useProviderForm('ProviderForm.Endpoints');
  const label = t(endpointLabelKeys[endpoint]);
  const value = state.endpointUrls[endpoint] ?? '';
  const trimmedValue = value.trim();
  const isInvalid = trimmedValue.length > 0 && !isValidEndpointBaseUrl(trimmedValue);
  const requestPreview = getCustomProviderEndpointRequestPreview(endpoint, trimmedValue);
  const isDefault = endpoint === state.defaultChatEndpoint && trimmedValue.length > 0;

  return (
    <TextField disabled={meta.isSubmitting} invalid={isInvalid}>
      <View className="min-h-7 flex-row items-center justify-between gap-3">
        <TextField.Label>{label}</TextField.Label>
        {isDefault ? (
          <Text className="font-medium text-muted-foreground text-xs">
            {t('settings.provider.apiService.defaultEndpoint')}
          </Text>
        ) : trimmedValue ? (
          <Button
            accessibilityLabel={t('settings.provider.apiService.setDefaultEndpointAccessibility', {
              endpoint: label,
            })}
            disabled={meta.isSubmitting || isInvalid}
            onPress={() => actions.setDefaultChatEndpoint(endpoint)}
            size="inline"
            variant="link"
          >
            {t('settings.provider.apiService.setDefaultEndpoint')}
          </Button>
        ) : null}
      </View>
      <Input
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onChangeText={(next) => actions.setEndpointUrl(endpoint, next)}
        placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
        value={value}
      />
      {requestPreview ? (
        <TextField.Description>
          {t('settings.provider.apiService.requestPreview', { url: requestPreview })}
        </TextField.Description>
      ) : null}
      <TextField.Error>
        {isInvalid ? t('settings.provider.apiService.invalidBaseUrlMessage') : undefined}
      </TextField.Error>
    </TextField>
  );
}

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

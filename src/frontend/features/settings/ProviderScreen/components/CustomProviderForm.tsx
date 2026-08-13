import { Input, Label, SecureInput, TextField } from '@cherrystudio/ui/components';
import { ENDPOINT_TYPE, type EndpointType } from '@cherrystudio/universal/data/types/model';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ProviderDefaultEndpointControl } from '../apiService';
import { normalizeApiKeySingleLine } from '../apiService/utils/providerApiServiceApiKeys';
import {
  type CustomProviderEndpointUrls,
  type CustomProviderTextEndpoint,
  isCustomProviderTextEndpointType,
} from '../apiService/utils/providerApiServiceEndpointRules';

export type CustomProviderFormValue = {
  apiKey: string;
  defaultChatEndpoint: CustomProviderTextEndpoint;
  endpointUrls: CustomProviderEndpointUrls;
  name: string;
};

export function createInitialCustomProviderFormValue(): CustomProviderFormValue {
  return {
    apiKey: '',
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    endpointUrls: {},
    name: '',
  };
}

export function isCustomProviderFormComplete(value: CustomProviderFormValue): boolean {
  return (
    value.name.trim().length > 0 &&
    Boolean(value.endpointUrls[ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]?.trim())
  );
}

export function CustomProviderForm({
  disabled = false,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: CustomProviderFormValue) => void;
  value: CustomProviderFormValue;
}) {
  const { t } = useTranslation();

  const update = useCallback(
    <TField extends keyof CustomProviderFormValue>(
      field: TField,
      nextValue: CustomProviderFormValue[TField],
    ) => onChange({ ...value, [field]: nextValue }),
    [onChange, value],
  );
  const updateEndpoint = useCallback(
    (endpoint: keyof CustomProviderEndpointUrls, nextValue: string) =>
      update('endpointUrls', { ...value.endpointUrls, [endpoint]: nextValue }),
    [update, value.endpointUrls],
  );
  const handleDefaultChatEndpointChange = useCallback(
    (endpoint: EndpointType) => {
      if (isCustomProviderTextEndpointType(endpoint)) {
        update('defaultChatEndpoint', endpoint);
      }
    },
    [update],
  );

  const baseUrl = value.endpointUrls[ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS] ?? '';

  return (
    <View className="gap-6">
      <FormField disabled={disabled} label={t('settings.provider.add.name')} required>
        <Input
          accessibilityLabel={t('settings.provider.add.name')}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(name) => update('name', name)}
          placeholder={t('settings.provider.add.namePlaceholder')}
          value={value.name}
        />
      </FormField>

      <FormField
        disabled={disabled}
        label={t('settings.provider.apiService.baseUrl')}
        labelAccessory={
          <ProviderDefaultEndpointControl
            endpoint={ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS}
            endpointLabel={t('settings.provider.apiService.baseUrl')}
            isDefault={value.defaultChatEndpoint === ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS}
            isDisabled={disabled}
            isSelectable={Boolean(baseUrl.trim())}
            onChange={handleDefaultChatEndpointChange}
          />
        }
        required
      >
        <Input
          accessibilityLabel={t('settings.provider.apiService.baseUrl')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={(url) => updateEndpoint(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, url)}
          placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
          value={baseUrl}
        />
      </FormField>

      <FormField disabled={disabled} label={t('settings.provider.apiService.apiKey')}>
        <SecureInput
          accessibilityLabel={t('settings.provider.apiService.apiKey')}
          disabled={disabled}
          lineBreakModeIOS="clip"
          numberOfLines={1}
          onChangeText={(apiKey) => update('apiKey', normalizeApiKeySingleLine(apiKey))}
          placeholder={t('settings.provider.apiService.apiKeyPlaceholder')}
          returnKeyType="done"
          scrollEnabled={false}
          value={value.apiKey}
          visibilityAccessibilityLabels={{
            hide: t('settings.provider.apiService.hideApiKeys'),
            show: t('settings.provider.apiService.showApiKeys'),
          }}
        />
      </FormField>

      <View className="gap-4">
        <Text className="font-medium text-foreground text-sm">
          {t('settings.provider.apiService.moreEndpoints')}
        </Text>
        <EndpointField
          defaultChatEndpoint={value.defaultChatEndpoint}
          disabled={disabled}
          endpoint={ENDPOINT_TYPE.ANTHROPIC_MESSAGES}
          label={t('settings.provider.add.endpoint.anthropic')}
          onDefaultChatEndpointChange={handleDefaultChatEndpointChange}
          onChangeText={(url) => updateEndpoint(ENDPOINT_TYPE.ANTHROPIC_MESSAGES, url)}
          value={value.endpointUrls[ENDPOINT_TYPE.ANTHROPIC_MESSAGES] ?? ''}
        />
        <EndpointField
          defaultChatEndpoint={value.defaultChatEndpoint}
          disabled={disabled}
          endpoint={ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT}
          label={t('settings.provider.add.endpoint.gemini')}
          onDefaultChatEndpointChange={handleDefaultChatEndpointChange}
          onChangeText={(url) => updateEndpoint(ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT, url)}
          value={value.endpointUrls[ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT] ?? ''}
        />
        <EndpointField
          defaultChatEndpoint={value.defaultChatEndpoint}
          disabled={disabled}
          endpoint={ENDPOINT_TYPE.OPENAI_RESPONSES}
          label={t('settings.provider.add.endpoint.openaiResponses')}
          onDefaultChatEndpointChange={handleDefaultChatEndpointChange}
          onChangeText={(url) => updateEndpoint(ENDPOINT_TYPE.OPENAI_RESPONSES, url)}
          value={value.endpointUrls[ENDPOINT_TYPE.OPENAI_RESPONSES] ?? ''}
        />
        <EndpointField
          disabled={disabled}
          label={t('settings.provider.add.endpoint.imageGeneration')}
          onChangeText={(url) => updateEndpoint(ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION, url)}
          value={value.endpointUrls[ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION] ?? ''}
        />
        <EndpointField
          disabled={disabled}
          label={t('settings.provider.add.endpoint.imageEdit')}
          onChangeText={(url) => updateEndpoint(ENDPOINT_TYPE.OPENAI_IMAGE_EDIT, url)}
          value={value.endpointUrls[ENDPOINT_TYPE.OPENAI_IMAGE_EDIT] ?? ''}
        />
      </View>
    </View>
  );
}

function FormField({
  children,
  disabled,
  label,
  labelAccessory,
  required,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  labelAccessory?: React.ReactNode;
  required?: boolean;
}) {
  return (
    <TextField isDisabled={disabled} isRequired={required}>
      {labelAccessory ? (
        <View className="h-9 flex-row items-center gap-2">
          <Label className="min-w-0 flex-1">{label}</Label>
          {labelAccessory}
        </View>
      ) : (
        <Label>{label}</Label>
      )}
      {children}
    </TextField>
  );
}

function EndpointField({
  defaultChatEndpoint,
  disabled,
  endpoint,
  label,
  onDefaultChatEndpointChange,
  onChangeText,
  value,
}: {
  defaultChatEndpoint?: CustomProviderTextEndpoint;
  disabled: boolean;
  endpoint?: CustomProviderTextEndpoint;
  label: string;
  onDefaultChatEndpointChange?: (endpoint: EndpointType) => void;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <TextField isDisabled={disabled}>
      <View className="h-9 flex-row items-center gap-2">
        <Label className="min-w-0 flex-1">{label}</Label>
        {endpoint && defaultChatEndpoint && onDefaultChatEndpointChange ? (
          <ProviderDefaultEndpointControl
            endpoint={endpoint}
            endpointLabel={label}
            isDefault={endpoint === defaultChatEndpoint && Boolean(value.trim())}
            isDisabled={disabled}
            isSelectable={Boolean(value.trim())}
            onChange={onDefaultChatEndpointChange}
          />
        ) : null}
      </View>
      <Input
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onChangeText={onChangeText}
        placeholder="https://api.example.com"
        value={value}
      />
    </TextField>
  );
}

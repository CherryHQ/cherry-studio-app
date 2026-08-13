import { CheckIcon, SettingsIcon } from '@cherrystudio/app-icons';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { Button, FieldError, Input, Label, TextField } from '@cherrystudio/ui/components';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { isCustomProviderTextEndpointType } from '../utils/providerApiServiceEndpointRules';

const ENDPOINT_LABEL_KEYS: Partial<Record<EndpointType, string>> = {
  [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'settings.provider.add.endpoint.openaiChatCompletions',
  [ENDPOINT_TYPE.OPENAI_RESPONSES]: 'settings.provider.add.endpoint.openaiResponses',
  [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: 'settings.provider.add.endpoint.anthropic',
  [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: 'settings.provider.add.endpoint.gemini',
  [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: 'settings.provider.add.endpoint.imageGeneration',
  [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT]: 'settings.provider.add.endpoint.imageEdit',
};

export function ProviderApiServiceEndpointField({
  baseUrl,
  onCommit,
  onManagePress,
}: {
  baseUrl: string;
  onCommit: (value: string) => Promise<boolean>;
  onManagePress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <TextField>
      <Label>
        <Label.Text className="font-semibold">
          {t('settings.provider.apiService.baseUrl')}
        </Label.Text>
      </Label>
      <View className="flex-row items-center gap-2">
        <PrimaryEndpointBaseUrlInput
          accessibilityLabel={t('settings.provider.apiService.baseUrl')}
          onCommit={onCommit}
          placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
          value={baseUrl}
        />
        <Button
          accessibilityLabel={t('settings.provider.apiService.manageEndpoints')}
          hitSlop={6}
          icon={<SettingsIcon />}
          onPress={onManagePress}
          variant="secondary"
        />
      </View>
    </TextField>
  );
}

function PrimaryEndpointBaseUrlInput({
  accessibilityLabel,
  onCommit,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  onCommit: (value: string) => Promise<boolean>;
  placeholder: string;
  value: string;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const [sourceValue, setSourceValue] = useState(value);

  if (sourceValue !== value) {
    setSourceValue(value);
    setDraftValue(value);
  }

  const handleBlur = useCallback(() => {
    if (draftValue === value) {
      return;
    }

    void onCommit(draftValue).then((didSave) => {
      if (!didSave) {
        setDraftValue(value);
      }
    });
  }, [draftValue, onCommit, value]);

  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="url"
      onBlur={handleBlur}
      onChangeText={setDraftValue}
      placeholder={placeholder}
      returnKeyType="done"
      submitBehavior="blurAndSubmit"
      style={styles.endpointInput}
      value={draftValue}
    />
  );
}

export function ProviderApiServiceEndpointForm({
  baseUrlByEndpoint,
  configuredEndpointTypes,
  defaultChatEndpoint,
  endpointErrors,
  endpointTypes,
  isSaving,
  onBaseUrlChange,
  onBaseUrlCommit,
  onDefaultChatEndpointChange,
}: {
  baseUrlByEndpoint: Partial<Record<EndpointType, string>>;
  configuredEndpointTypes: readonly EndpointType[];
  defaultChatEndpoint: EndpointType;
  endpointErrors?: Partial<Record<EndpointType, string>>;
  endpointTypes: EndpointType[];
  isSaving?: boolean;
  onBaseUrlChange: (endpoint: EndpointType, value: string) => void;
  onBaseUrlCommit: (endpoint: EndpointType, value: string) => void;
  onDefaultChatEndpointChange: (endpoint: EndpointType) => void;
}) {
  const { t } = useTranslation();
  const configuredEndpointTypeSet = new Set(configuredEndpointTypes);

  return (
    <View className="gap-3">
      {endpointTypes.map((endpoint) => {
        const labelKey = ENDPOINT_LABEL_KEYS[endpoint];
        const label = labelKey ? t(labelKey) : endpoint;
        const value = baseUrlByEndpoint[endpoint] ?? '';
        const isDefaultChatEndpoint =
          endpoint === defaultChatEndpoint && isCustomProviderTextEndpointType(endpoint);
        const canSetAsDefault =
          isCustomProviderTextEndpointType(endpoint) &&
          (configuredEndpointTypeSet.has(endpoint) || Boolean(value.trim()));

        return (
          <TextField key={endpoint} isInvalid={Boolean(endpointErrors?.[endpoint])}>
            <View
              className="h-9 flex-row items-center gap-2"
              testID={`endpoint-label-row-${endpoint}`}
            >
              <Label className="min-w-0 flex-1">{label}</Label>
              <ProviderDefaultEndpointControl
                endpoint={endpoint}
                endpointLabel={label}
                isDefault={isDefaultChatEndpoint}
                isDisabled={isSaving}
                isSelectable={canSetAsDefault}
                onChange={onDefaultChatEndpointChange}
              />
            </View>
            <EndpointBaseUrlInput
              accessibilityLabel={label}
              placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
              value={value}
              onChangeText={(value) => onBaseUrlChange(endpoint, value)}
              onCommit={(value) => onBaseUrlCommit(endpoint, value)}
            />
            <FieldError>{endpointErrors?.[endpoint]}</FieldError>
          </TextField>
        );
      })}
    </View>
  );
}

export function ProviderDefaultEndpointControl({
  endpoint,
  endpointLabel,
  isDefault,
  isDisabled = false,
  isSelectable,
  onChange,
}: {
  endpoint: EndpointType;
  endpointLabel: string;
  isDefault: boolean;
  isDisabled?: boolean;
  isSelectable: boolean;
  onChange: (endpoint: EndpointType) => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onChange(endpoint), [endpoint, onChange]);

  if (isDefault) {
    return (
      <View className="shrink-0 flex-row items-center gap-1.5 px-2 py-2">
        <CheckIcon className="size-4 text-foreground" />
        <Text className="text-foreground text-sm">
          {t('settings.provider.apiService.defaultEndpoint')}
        </Text>
      </View>
    );
  }

  if (!isSelectable) {
    return null;
  }

  return (
    <Button
      accessibilityLabel={t('settings.provider.apiService.setDefaultEndpointAccessibility', {
        endpoint: endpointLabel,
      })}
      disabled={isDisabled}
      onPress={handlePress}
      size="sm"
      variant="outline"
    >
      {t('settings.provider.apiService.setDefaultEndpoint')}
    </Button>
  );
}

function EndpointBaseUrlInput({
  accessibilityLabel,
  onCommit,
  onChangeText,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  onCommit: (value: string) => void;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const handleEndEditing = useCallback(
    (event: TextInputEndEditingEvent) => {
      onCommit(event.nativeEvent.text);
    },
    [onCommit],
  );

  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="none"
      autoCorrect={false}
      onChangeText={onChangeText}
      onEndEditing={handleEndEditing}
      placeholder={placeholder}
      returnKeyType="done"
      submitBehavior="blurAndSubmit"
      style={styles.endpointInput}
      value={value}
    />
  );
}

const styles = StyleSheet.create({
  endpointInput: {
    flex: 1,
  },
});

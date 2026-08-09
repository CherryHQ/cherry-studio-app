import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import {
  Button,
  Description,
  FieldError,
  Input,
  Label,
  TextField,
} from '@cherrystudio/ui/components';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import { SettingsIcon } from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';

const ENDPOINT_LABEL_KEYS: Partial<Record<EndpointType, string>> = {
  [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'settings.provider.add.endpoint.openaiChatCompletions',
  [ENDPOINT_TYPE.OPENAI_RESPONSES]: 'settings.provider.add.endpoint.openaiResponses',
  [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: 'settings.provider.add.endpoint.anthropic',
  [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: 'settings.provider.add.endpoint.gemini',
  [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: 'settings.provider.add.endpoint.imageGeneration',
  [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT]: 'settings.provider.add.endpoint.imageEdit',
};

const ENDPOINT_HELP_KEYS: Partial<Record<EndpointType, string>> = {
  [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]:
    'settings.provider.apiService.imageGenerationBaseUrlHelp',
  [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT]: 'settings.provider.apiService.imageEditBaseUrlHelp',
};

export function ProviderApiServiceEndpointField({
  baseUrl,
  onManagePress,
}: {
  baseUrl: string;
  onManagePress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <TextField isDisabled>
      <Label>{t('settings.provider.apiService.baseUrl')}</Label>
      <View className="flex-row items-center gap-2">
        <Input
          accessibilityLabel={t('settings.provider.apiService.baseUrl')}
          placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
          style={styles.endpointInput}
          value={baseUrl}
        />
        <Button
          accessibilityLabel={t('settings.provider.apiService.manageEndpoints')}
          hitSlop={6}
          icon={<SettingsIcon strokeWidth={2} />}
          onPress={onManagePress}
          variant="secondary"
        />
      </View>
    </TextField>
  );
}

export function ProviderApiServiceEndpointForm({
  baseUrlByEndpoint,
  endpointErrors,
  endpointTypes,
  onBaseUrlChange,
  onBaseUrlCommit,
}: {
  baseUrlByEndpoint: Partial<Record<EndpointType, string>>;
  endpointErrors?: Partial<Record<EndpointType, string>>;
  endpointTypes: EndpointType[];
  onBaseUrlChange: (endpoint: EndpointType, value: string) => void;
  onBaseUrlCommit: (endpoint: EndpointType, value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-3">
      {endpointTypes.map((endpoint) => {
        const labelKey = ENDPOINT_LABEL_KEYS[endpoint];
        const helpKey = ENDPOINT_HELP_KEYS[endpoint];
        const label = labelKey ? t(labelKey) : endpoint;

        return (
          <TextField key={endpoint} isInvalid={Boolean(endpointErrors?.[endpoint])}>
            <Label>{label}</Label>
            <EndpointBaseUrlInput
              accessibilityLabel={label}
              placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
              value={baseUrlByEndpoint[endpoint] ?? ''}
              onChangeText={(value) => onBaseUrlChange(endpoint, value)}
              onCommit={(value) => onBaseUrlCommit(endpoint, value)}
            />
            {helpKey ? <Description hideOnInvalid>{t(helpKey)}</Description> : null}
            <FieldError>{endpointErrors?.[endpoint]}</FieldError>
          </TextField>
        );
      })}
    </View>
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

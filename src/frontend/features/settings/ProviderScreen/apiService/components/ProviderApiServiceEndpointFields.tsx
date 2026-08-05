import { Button, FieldError, Input, Label, TextField } from '@cherrystudio/ui/components';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import { SettingsIcon } from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { getEndpointLabel } from '../utils/providerApiServiceEndpointRules';

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
  pendingEndpoint,
  onBaseUrlChange,
  onBaseUrlCommit,
}: {
  baseUrlByEndpoint: Partial<Record<EndpointType, string>>;
  endpointErrors?: Partial<Record<EndpointType, string>>;
  endpointTypes: EndpointType[];
  pendingEndpoint?: EndpointType | null;
  onBaseUrlChange: (endpoint: EndpointType, value: string) => void;
  onBaseUrlCommit: (endpoint: EndpointType, value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-3">
      {endpointTypes.map((endpoint) => (
        <TextField
          key={endpoint}
          isDisabled={pendingEndpoint === endpoint}
          isInvalid={Boolean(endpointErrors?.[endpoint])}
        >
          <Label>{getEndpointLabel(endpoint)}</Label>
          <EndpointBaseUrlInput
            accessibilityLabel={getEndpointLabel(endpoint)}
            placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
            value={baseUrlByEndpoint[endpoint] ?? ''}
            onChangeText={(value) => onBaseUrlChange(endpoint, value)}
            onCommit={(value) => onBaseUrlCommit(endpoint, value)}
          />
          <FieldError>{endpointErrors?.[endpoint]}</FieldError>
        </TextField>
      ))}
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

  const handleCommitEvent = useCallback(() => {
    onCommit(value);
  }, [onCommit, value]);

  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="none"
      autoCorrect={false}
      onBlur={handleCommitEvent}
      onChangeText={onChangeText}
      onEndEditing={handleEndEditing}
      onSubmitEditing={handleCommitEvent}
      placeholder={placeholder}
      returnKeyType="done"
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

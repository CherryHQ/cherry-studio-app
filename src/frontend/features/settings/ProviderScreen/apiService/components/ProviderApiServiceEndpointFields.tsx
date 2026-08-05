import { Button, FieldError, Input, Label, TextField } from '@cherrystudio/ui/components';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import { Select } from 'heroui-native';
import { PlusIcon, SettingsIcon, Trash2Icon } from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import {
  getEndpointLabel,
  isConfigurableEndpointType,
} from '../utils/providerApiServiceEndpointRules';

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
  addableEndpointOptions,
  baseUrlByEndpoint,
  endpointErrors,
  pendingEndpoint,
  primaryEndpoint,
  visibleEndpointTypes,
  onAddEndpoint,
  onBaseUrlChange,
  onBaseUrlCommit,
  onPrimaryEndpointChange,
  onRemoveEndpoint,
}: {
  addableEndpointOptions: EndpointType[];
  baseUrlByEndpoint: Partial<Record<EndpointType, string>>;
  endpointErrors?: Partial<Record<EndpointType, string>>;
  pendingEndpoint?: EndpointType | null;
  primaryEndpoint: EndpointType;
  visibleEndpointTypes: EndpointType[];
  onAddEndpoint: (endpoint: EndpointType) => void;
  onBaseUrlChange: (endpoint: EndpointType, value: string) => void;
  onBaseUrlCommit: (endpoint: EndpointType, value: string) => void;
  onPrimaryEndpointChange: (endpoint: EndpointType) => void;
  onRemoveEndpoint: (endpoint: EndpointType) => void;
}) {
  const { t } = useTranslation();
  const sheetEndpointTypes = [
    primaryEndpoint,
    ...visibleEndpointTypes.filter((endpoint) => endpoint !== primaryEndpoint),
  ];
  const primaryEndpointOptions = visibleEndpointTypes.filter((endpoint) =>
    Boolean(baseUrlByEndpoint[endpoint]?.trim()),
  );

  return (
    <View className="gap-3">
      <EndpointSelect
        label={t('settings.provider.apiService.defaultEndpoint')}
        options={primaryEndpointOptions}
        value={primaryEndpoint}
        onValueChange={onPrimaryEndpointChange}
      />
      {sheetEndpointTypes.length > 0 ? (
        <View className="gap-3">
          {sheetEndpointTypes.map((endpoint) => {
            const isPrimaryEndpoint = endpoint === primaryEndpoint;

            return (
              <TextField
                key={endpoint}
                isDisabled={pendingEndpoint === endpoint}
                isInvalid={Boolean(endpointErrors?.[endpoint])}
              >
                <Label>{getEndpointLabel(endpoint)}</Label>
                <View className="flex-row items-center gap-2">
                  <EndpointBaseUrlInput
                    accessibilityLabel={getEndpointLabel(endpoint)}
                    placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
                    value={baseUrlByEndpoint[endpoint] ?? ''}
                    onChangeText={(value) => onBaseUrlChange(endpoint, value)}
                    onCommit={(value) => onBaseUrlCommit(endpoint, value)}
                  />
                  {!isPrimaryEndpoint ? (
                    <Button
                      accessibilityLabel={t('settings.provider.apiService.removeEndpoint')}
                      disabled={pendingEndpoint === endpoint}
                      hitSlop={6}
                      icon={<Trash2Icon strokeWidth={2} />}
                      onPress={() => onRemoveEndpoint(endpoint)}
                      variant="secondary"
                    />
                  ) : null}
                </View>
                <FieldError>{endpointErrors?.[endpoint]}</FieldError>
              </TextField>
            );
          })}
        </View>
      ) : (
        <Text className="rounded-xl bg-settings-grouped-surface px-3 py-3 text-center text-default-foreground text-sm">
          {t('settings.provider.apiService.noAdditionalEndpoints')}
        </Text>
      )}

      {addableEndpointOptions.length > 0 ? (
        <AddEndpointSelect
          label={t('settings.provider.apiService.addEndpoint')}
          options={addableEndpointOptions}
          onValueChange={onAddEndpoint}
        />
      ) : null}
    </View>
  );
}

function EndpointSelect({
  label,
  onValueChange,
  options,
  value,
}: {
  label: string;
  onValueChange: (value: EndpointType) => void;
  options: EndpointType[];
  value: EndpointType;
}) {
  const handleValueChange = useCallback(
    (nextOption?: { label: string; value: string }) => {
      const endpoint = nextOption?.value as EndpointType | undefined;
      if (endpoint && options.includes(endpoint)) onValueChange(endpoint);
    },
    [onValueChange, options],
  );

  return (
    <View className="gap-1">
      <Text className="font-medium text-default-foreground text-sm">{label}</Text>
      <Select value={{ label: getEndpointLabel(value), value }} onValueChange={handleValueChange}>
        <Select.Trigger
          accessibilityLabel={label}
          className="h-10 min-h-10 rounded-xl bg-settings-grouped-surface px-3 py-0"
        >
          <Select.Value className="flex-1 text-base text-foreground" placeholder={label} />
          <Select.TriggerIndicator />
        </Select.Trigger>
        <Select.Portal>
          <Select.Overlay />
          <Select.Content className="p-2" presentation="popover" width="trigger" placement="bottom">
            {options.map((option) => (
              <Select.Item key={option} label={getEndpointLabel(option)} value={option}>
                <Select.ItemLabel className="flex-1" numberOfLines={1} />
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Portal>
      </Select>
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

function AddEndpointSelect({
  label,
  onValueChange,
  options,
}: {
  label: string;
  onValueChange: (value: EndpointType) => void;
  options: EndpointType[];
}) {
  const handleValueChange = useCallback(
    (nextOption?: { label: string; value: string }) => {
      const endpoint = nextOption?.value as EndpointType | undefined;

      if (!isConfigurableEndpointType(endpoint)) {
        return;
      }

      onValueChange(endpoint);
    },
    [onValueChange],
  );

  return (
    <Select value={undefined} onValueChange={handleValueChange}>
      <Select.Trigger
        accessibilityLabel={label}
        className="h-10 min-h-10 flex-row items-center justify-center gap-2 rounded-xl bg-settings-grouped-surface px-3 py-0"
      >
        <PlusIcon className="size-4 text-default-foreground" strokeWidth={2} />
        <Text className="text-base text-foreground" numberOfLines={1}>
          {label}
        </Text>
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        <Select.Content className="p-2" presentation="popover" width="trigger" placement="bottom">
          {options.map((option) => (
            <Select.Item key={option} label={getEndpointLabel(option)} value={option}>
              <Select.ItemLabel className="flex-1" numberOfLines={1} />
              <Select.ItemIndicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}

import { Select } from 'heroui-native';
import { Button } from 'heroui-native/button';
import { Input } from 'heroui-native/input';
import { PlusIcon, SettingsIcon, Trash2Icon } from 'lucide-uniwind';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { Text, View } from 'react-native';

import type { EndpointType } from '@/data/types/model';
import {
  getEndpointLabel,
  isConfigurableEndpointType,
} from '../utils/providerApiServiceEndpointRules';
import { providerApiServiceStyles } from '../utils/providerApiServiceStyles';

export function ProviderApiServiceEndpointField({
  baseUrl,
  onManagePress,
}: {
  baseUrl: string;
  onManagePress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-1">
      <Text className="font-medium text-default-foreground text-sm">
        {t('settings.provider.apiService.baseUrl')}
      </Text>
      <View className="flex-row items-center gap-2">
        <Input
          accessibilityLabel={t('settings.provider.apiService.baseUrl')}
          className="h-10 min-h-0 flex-1 rounded-xl px-3 py-0 text-base leading-5"
          isDisabled
          placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
          style={providerApiServiceStyles.input}
          value={baseUrl}
          variant="secondary"
        />
        <Button
          accessibilityLabel={t('settings.provider.apiService.manageEndpoints')}
          className="h-10 min-h-0 rounded-xl"
          isIconOnly
          onPress={onManagePress}
          variant="secondary"
        >
          <SettingsIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </Button>
      </View>
    </View>
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
  onRemoveEndpoint: (endpoint: EndpointType) => void;
}) {
  const { t } = useTranslation();
  const sheetEndpointTypes = [
    primaryEndpoint,
    ...visibleEndpointTypes.filter((endpoint) => endpoint !== primaryEndpoint),
  ];

  return (
    <View className="gap-3">
      {sheetEndpointTypes.length > 0 ? (
        <View className="gap-3">
          {sheetEndpointTypes.map((endpoint) => {
            const isPrimaryEndpoint = endpoint === primaryEndpoint;

            return (
              <View key={endpoint} className="gap-1">
                <Text className="font-medium text-default-foreground text-sm" numberOfLines={1}>
                  {getEndpointLabel(endpoint)}
                </Text>
                <View className="flex-row items-center gap-2">
                  <EndpointBaseUrlInput
                    accessibilityLabel={getEndpointLabel(endpoint)}
                    className="flex-1"
                    isDisabled={pendingEndpoint === endpoint}
                    placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
                    value={baseUrlByEndpoint[endpoint] ?? ''}
                    onChangeText={(value) => onBaseUrlChange(endpoint, value)}
                    onCommit={(value) => onBaseUrlCommit(endpoint, value)}
                  />
                  {!isPrimaryEndpoint ? (
                    <Button
                      accessibilityLabel={t('settings.provider.apiService.removeEndpoint')}
                      className={`h-10 min-h-0 rounded-xl ${pendingEndpoint === endpoint ? 'opacity-40' : ''}`}
                      isDisabled={pendingEndpoint === endpoint}
                      isIconOnly
                      onPress={() => onRemoveEndpoint(endpoint)}
                      variant="secondary"
                    >
                      <Trash2Icon className="size-5 text-default-foreground" strokeWidth={2} />
                    </Button>
                  ) : null}
                </View>
                {endpointErrors?.[endpoint] ? (
                  <Text className="text-danger text-xs">{endpointErrors[endpoint]}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Text className="rounded-xl bg-surface-secondary px-3 py-3 text-center text-default-foreground text-sm">
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

function EndpointBaseUrlInput({
  accessibilityLabel,
  className,
  isDisabled,
  onCommit,
  onChangeText,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  className?: string;
  isDisabled?: boolean;
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
      className={`h-10 min-h-0 rounded-xl px-3 py-0 text-base leading-5 ${className ?? ''}`}
      isDisabled={isDisabled}
      onBlur={handleCommitEvent}
      onChangeText={onChangeText}
      onEndEditing={handleEndEditing}
      onSubmitEditing={handleCommitEvent}
      placeholder={placeholder}
      returnKeyType="done"
      style={providerApiServiceStyles.input}
      value={value}
      variant="secondary"
    />
  );
}

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
        className="h-10 min-h-10 flex-row items-center justify-center gap-2 rounded-xl bg-surface-secondary px-3 py-0"
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

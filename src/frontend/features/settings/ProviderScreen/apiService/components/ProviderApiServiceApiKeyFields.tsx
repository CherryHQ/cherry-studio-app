import { Switch } from '@cherrystudio/ui/components';
import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import * as Clipboard from 'expo-clipboard';
import { Button } from 'heroui-native/button';
import { Input } from 'heroui-native/input';
import {
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { Pressable, Text, View } from 'react-native';

import { SettingsIconButton } from '../../../components/SettingsIconButton';
import { normalizeApiKeySingleLine } from '../utils/providerApiServiceApiKeys';
import { providerApiServiceStyles } from '../utils/providerApiServiceStyles';

const apiKeyPreviewMaxLength = 21;

export function ProviderApiServiceApiKeysField({
  apiKeysInput,
  apiKeysVisible,
  onManagePress,
  onToggleVisible,
}: {
  apiKeysInput: string;
  apiKeysVisible: boolean;
  onManagePress: () => void;
  onToggleVisible: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-1">
      <Text className="font-medium text-default-foreground text-sm">
        {t('settings.provider.apiService.apiKeys')}
      </Text>
      <View className="flex-row items-center gap-2">
        {apiKeysVisible ? (
          <View className="h-10 min-w-0 flex-1 overflow-hidden rounded-xl">
            <ApiKeysVisiblePreview
              accessibilityLabel={t('settings.provider.apiService.apiKeys')}
              onPress={onManagePress}
              placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
              value={apiKeysInput}
            />
          </View>
        ) : (
          <ApiKeysMaskedPreview
            accessibilityLabel={t('settings.provider.apiService.apiKeys')}
            hasValue={apiKeysInput.trim().length > 0}
            placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
            onPress={onToggleVisible}
          />
        )}
        <SettingsIconButton
          accessibilityLabel={
            apiKeysVisible
              ? t('settings.provider.apiService.hideApiKeys')
              : t('settings.provider.apiService.showApiKeys')
          }
          onPress={onToggleVisible}
        >
          <ApiKeysVisibilityIcon visible={apiKeysVisible} />
        </SettingsIconButton>
        <SettingsIconButton
          accessibilityLabel={t('settings.provider.apiService.manageApiKeys')}
          onPress={onManagePress}
        >
          <KeyRoundIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </SettingsIconButton>
      </View>
    </View>
  );
}

function ApiKeysVisiblePreview({
  accessibilityLabel,
  onPress,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  placeholder: string;
  value: string;
}) {
  const previewValue = clipApiKeyPreviewValue(normalizeApiKeysInputSingleLine(value));

  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="none"
      autoCorrect={false}
      className="h-10 max-h-10 min-h-0 w-full overflow-hidden rounded-xl px-3 py-0 text-base"
      editable={false}
      lineBreakModeIOS="clip"
      multiline={false}
      numberOfLines={1}
      onPressIn={onPress}
      placeholder={placeholder}
      returnKeyType="done"
      scrollEnabled={false}
      style={providerApiServiceStyles.input}
      value={previewValue}
      variant="secondary"
    />
  );
}

function ApiKeysMaskedPreview({
  accessibilityLabel,
  hasValue,
  onPress,
  placeholder,
}: {
  accessibilityLabel: string;
  hasValue: boolean;
  onPress: () => void;
  placeholder: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="h-10 min-h-0 flex-1 justify-center overflow-hidden rounded-xl bg-settings-grouped-surface px-3 active:opacity-70"
      onPress={onPress}
    >
      <Text
        className={hasValue ? 'text-base text-foreground' : 'text-base text-default-foreground'}
        numberOfLines={1}
      >
        {hasValue ? '••••••••••••••••••••••••••••••••' : placeholder}
      </Text>
    </Pressable>
  );
}

export function ProviderApiServiceApiKeyForm({
  apiKeys,
  apiKeyErrors,
  pendingApiKeyIds,
  onAdd,
  onCommitKey,
  onEnabledChange,
  onKeyChange,
  onRemove,
}: {
  apiKeys: readonly ApiKeyEntry[];
  apiKeyErrors?: Record<string, string>;
  pendingApiKeyIds?: ReadonlySet<string>;
  onAdd: () => void;
  onCommitKey: (id: string, key: string) => void;
  onEnabledChange: (id: string, isEnabled: boolean) => void;
  onKeyChange: (id: string, key: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-3">
      {apiKeys.length > 0 ? (
        <View className="gap-3">
          {apiKeys.map((apiKey) => (
            <ApiKeyRow
              apiKey={apiKey}
              errorMessage={apiKeyErrors?.[apiKey.id]}
              key={apiKey.id}
              isPending={pendingApiKeyIds?.has(apiKey.id) ?? false}
              onCommitKey={onCommitKey}
              onEnabledChange={onEnabledChange}
              onKeyChange={onKeyChange}
              onRemove={onRemove}
            />
          ))}
        </View>
      ) : null}

      <Button
        className="h-10 min-h-10 flex-row items-center justify-center gap-2 rounded-xl"
        onPress={onAdd}
        variant="secondary"
      >
        <PlusIcon className="size-4 text-default-foreground" strokeWidth={2} />
        <Text className="text-base text-foreground">
          {t('settings.provider.apiService.addApiKey')}
        </Text>
      </Button>
    </View>
  );
}

function ApiKeysVisibilityIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <EyeIcon className="size-5 text-default-foreground" strokeWidth={2} />
  ) : (
    <EyeOffIcon className="size-5 text-default-foreground" strokeWidth={2} />
  );
}

function ApiKeyRow({
  apiKey,
  errorMessage,
  isPending,
  onCommitKey,
  onEnabledChange,
  onKeyChange,
  onRemove,
}: {
  apiKey: ApiKeyEntry;
  errorMessage?: string;
  isPending: boolean;
  onCommitKey: (id: string, key: string) => void;
  onEnabledChange: (id: string, isEnabled: boolean) => void;
  onKeyChange: (id: string, key: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-1">
      <View className="min-h-8 flex-row items-center justify-between gap-3">
        <Text className="font-medium text-default-foreground text-sm">
          {t('settings.provider.apiService.apiKey')}
        </Text>
        <Switch
          accessibilityLabel={t('settings.provider.apiService.apiKeyEnabled')}
          disabled={isPending}
          onValueChange={(isEnabled) => onEnabledChange(apiKey.id, isEnabled)}
          value={apiKey.isEnabled}
        />
      </View>
      <View className="flex-row items-center gap-2">
        <View className="h-10 min-w-0 flex-1 overflow-hidden rounded-xl">
          <ApiKeyInput
            accessibilityLabel={t('settings.provider.apiService.apiKey')}
            isDisabled={!apiKey.isEnabled || isPending}
            value={apiKey.key}
            onChangeText={(key) => onKeyChange(apiKey.id, key)}
            onCommit={(key) => onCommitKey(apiKey.id, key)}
          />
        </View>
        <SettingsIconButton
          accessibilityLabel={t('settings.provider.apiService.copyApiKey')}
          isDisabled={isPending}
          onPress={() => void Clipboard.setStringAsync(apiKey.key)}
        >
          <CopyIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </SettingsIconButton>
        <SettingsIconButton
          accessibilityLabel={t('settings.provider.apiService.removeApiKey')}
          isDisabled={isPending}
          onPress={() => onRemove(apiKey.id)}
        >
          <Trash2Icon className="size-5 text-default-foreground" strokeWidth={2} />
        </SettingsIconButton>
      </View>
      {errorMessage ? <Text className="text-danger text-xs">{errorMessage}</Text> : null}
    </View>
  );
}

function ApiKeyInput({
  accessibilityLabel,
  isDisabled,
  onCommit,
  onChangeText,
  value,
}: {
  accessibilityLabel: string;
  isDisabled?: boolean;
  onCommit: (value: string) => void;
  onChangeText: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation();
  const handleEndEditing = useCallback(
    (event: TextInputEndEditingEvent) => {
      onCommit(normalizeApiKeySingleLine(event.nativeEvent.text));
    },
    [onCommit],
  );

  const handleCommitEvent = useCallback(() => {
    onCommit(normalizeApiKeySingleLine(value));
  }, [onCommit, value]);

  const handleChangeText = useCallback(
    (nextValue: string) => {
      onChangeText(normalizeApiKeySingleLine(nextValue));
    },
    [onChangeText],
  );
  const normalizedValue = normalizeApiKeySingleLine(value);

  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="none"
      autoCorrect={false}
      className="h-10 max-h-10 min-h-0 w-full overflow-hidden rounded-xl px-3 py-0 text-base"
      isDisabled={isDisabled}
      lineBreakModeIOS="clip"
      multiline={false}
      numberOfLines={1}
      onBlur={handleCommitEvent}
      onChangeText={handleChangeText}
      onEndEditing={handleEndEditing}
      onSubmitEditing={handleCommitEvent}
      placeholder={t('settings.provider.apiService.apiKeyPlaceholder')}
      returnKeyType="done"
      scrollEnabled={false}
      style={providerApiServiceStyles.input}
      value={normalizedValue}
      variant="secondary"
    />
  );
}

function clipApiKeyPreviewValue(value: string): string {
  if (value.length <= apiKeyPreviewMaxLength) {
    return value;
  }

  return `${value.slice(0, apiKeyPreviewMaxLength)}...`;
}

function normalizeApiKeysInputSingleLine(value: string): string {
  return value.replaceAll(/[\r\n]+/g, ',');
}

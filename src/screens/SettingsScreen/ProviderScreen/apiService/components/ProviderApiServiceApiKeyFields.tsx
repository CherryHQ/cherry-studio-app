import * as Clipboard from 'expo-clipboard';
import { Button } from 'heroui-native/button';
import { Input } from 'heroui-native/input';
import { Switch } from 'heroui-native/switch';
import { CopyIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, PlusIcon, Trash2Icon } from 'lucide-uniwind';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { Text, View } from 'react-native';

import type { ApiKeyEntry } from '@/data/types/provider';
import { providerApiServiceStyles } from '../utils/providerApiServiceStyles';

export function ProviderApiServiceApiKeysField({
  apiKeysInput,
  apiKeysVisible,
  onApiKeysInputChange,
  onManagePress,
  onToggleVisible,
}: {
  apiKeysInput: string;
  apiKeysVisible: boolean;
  onApiKeysInputChange: (value: string) => void;
  onManagePress: () => void;
  onToggleVisible: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-1">
      <Text className="font-medium text-default-foreground text-sm">
        {t('settings.provider.apiService.apiKeys')}
      </Text>
      <View className="flex-row items-start gap-2">
        <ApiKeysCommitInput
          accessibilityLabel={t('settings.provider.apiService.apiKeys')}
          onCommit={onApiKeysInputChange}
          placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
          secureTextEntry={!apiKeysVisible}
          value={apiKeysInput}
        />
        <Button
          accessibilityLabel={
            apiKeysVisible
              ? t('settings.provider.apiService.hideApiKeys')
              : t('settings.provider.apiService.showApiKeys')
          }
          className="h-10 min-h-0 rounded-xl"
          isIconOnly
          onPress={onToggleVisible}
          variant="secondary"
        >
          <ApiKeysVisibilityIcon visible={apiKeysVisible} />
        </Button>
        <Button
          accessibilityLabel={t('settings.provider.apiService.manageApiKeys')}
          className="h-10 min-h-0 rounded-xl"
          isIconOnly
          onPress={onManagePress}
          variant="secondary"
        >
          <KeyRoundIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </Button>
      </View>
    </View>
  );
}

function ApiKeysCommitInput({
  accessibilityLabel,
  onCommit,
  placeholder,
  secureTextEntry,
  value,
}: {
  accessibilityLabel: string;
  onCommit: (value: string) => void;
  placeholder: string;
  secureTextEntry: boolean;
  value: string;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const draftValueRef = useRef(draftValue);
  const onCommitRef = useRef(onCommit);
  const valueRef = useRef(value);

  useEffect(() => {
    setDraftValue(value);
    draftValueRef.current = value;
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const commitValue = useCallback((nextValue = draftValueRef.current) => {
    if (nextValue !== valueRef.current) {
      onCommitRef.current(nextValue);
      valueRef.current = nextValue;
    }
  }, []);

  useEffect(
    () => () => {
      commitValue();
    },
    [commitValue],
  );

  const handleChangeText = useCallback((nextValue: string) => {
    draftValueRef.current = nextValue;
    setDraftValue(nextValue);
  }, []);

  const handleEndEditing = useCallback(
    (event: TextInputEndEditingEvent) => {
      draftValueRef.current = event.nativeEvent.text;
      commitValue(event.nativeEvent.text);
    },
    [commitValue],
  );

  const handleCommitEvent = useCallback(() => {
    commitValue();
  }, [commitValue]);

  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="none"
      autoCorrect={false}
      className="h-10 min-h-0 flex-1 rounded-xl px-3 py-0 text-base leading-5"
      onBlur={handleCommitEvent}
      onChangeText={handleChangeText}
      onEndEditing={handleEndEditing}
      onSubmitEditing={handleCommitEvent}
      placeholder={placeholder}
      returnKeyType="done"
      secureTextEntry={secureTextEntry}
      style={providerApiServiceStyles.input}
      value={draftValue}
      variant="secondary"
    />
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
          isDisabled={isPending}
          isSelected={apiKey.isEnabled}
          onSelectedChange={(isEnabled) => onEnabledChange(apiKey.id, isEnabled)}
        />
      </View>
      <View className="flex-row items-center gap-2">
        <ApiKeyInput
          accessibilityLabel={t('settings.provider.apiService.apiKey')}
          isDisabled={!apiKey.isEnabled || isPending}
          value={apiKey.key}
          onChangeText={(key) => onKeyChange(apiKey.id, key)}
          onCommit={(key) => onCommitKey(apiKey.id, key)}
        />
        <Button
          accessibilityLabel={t('settings.provider.apiService.copyApiKey')}
          className={`h-10 min-h-0 rounded-xl ${isPending ? 'opacity-40' : ''}`}
          isDisabled={isPending}
          isIconOnly
          onPress={() => void Clipboard.setStringAsync(apiKey.key)}
          variant="secondary"
        >
          <CopyIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </Button>
        <Button
          accessibilityLabel={t('settings.provider.apiService.removeApiKey')}
          className={`h-10 min-h-0 rounded-xl ${isPending ? 'opacity-40' : ''}`}
          isDisabled={isPending}
          isIconOnly
          onPress={() => onRemove(apiKey.id)}
          variant="secondary"
        >
          <Trash2Icon className="size-5 text-default-foreground" strokeWidth={2} />
        </Button>
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
      className="h-10 min-h-0 flex-1 rounded-xl px-3 py-0 text-base leading-5"
      isDisabled={isDisabled}
      onBlur={handleCommitEvent}
      onChangeText={onChangeText}
      onEndEditing={handleEndEditing}
      onSubmitEditing={handleCommitEvent}
      placeholder={t('settings.provider.apiService.apiKeyPlaceholder')}
      returnKeyType="done"
      style={providerApiServiceStyles.input}
      value={value}
      variant="secondary"
    />
  );
}

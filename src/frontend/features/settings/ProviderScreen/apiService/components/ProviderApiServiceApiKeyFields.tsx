import { Button, FieldError, Input, Label, Switch, TextField } from '@cherrystudio/ui/components';
import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import * as Clipboard from 'expo-clipboard';
import {
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-uniwind/png';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { View } from 'react-native';

import { normalizeApiKeySingleLine } from '../utils/providerApiServiceApiKeys';

export function ProviderApiServiceApiKeysField({
  apiKeysInput,
  apiKeysVisible,
  onCommit,
  onManagePress,
  onToggleVisible,
}: {
  apiKeysInput: string;
  apiKeysVisible: boolean;
  onCommit: (value: string) => void;
  onManagePress: () => void;
  onToggleVisible: () => void;
}) {
  const { t } = useTranslation();

  return (
    <TextField>
      <Label>{t('settings.provider.apiService.apiKeys')}</Label>
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1 overflow-hidden">
          <ApiKeysCommitInput
            accessibilityLabel={t('settings.provider.apiService.apiKeys')}
            isVisible={apiKeysVisible}
            onCommit={onCommit}
            placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
            value={apiKeysInput}
          />
        </View>
        <Button
          accessibilityLabel={
            apiKeysVisible
              ? t('settings.provider.apiService.hideApiKeys')
              : t('settings.provider.apiService.showApiKeys')
          }
          hitSlop={2}
          icon={apiKeysVisible ? <EyeIcon strokeWidth={2} /> : <EyeOffIcon strokeWidth={2} />}
          onPress={onToggleVisible}
          variant="secondary"
        />
        <Button
          accessibilityLabel={t('settings.provider.apiService.manageApiKeys')}
          hitSlop={2}
          icon={<KeyRoundIcon strokeWidth={2} />}
          onPress={onManagePress}
          variant="secondary"
        />
      </View>
    </TextField>
  );
}

function ApiKeysCommitInput({
  accessibilityLabel,
  isVisible,
  onCommit,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  isVisible: boolean;
  onCommit: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const [sourceValue, setSourceValue] = useState(value);

  if (sourceValue !== value) {
    setSourceValue(value);
    setDraftValue(value);
  }

  const commitValue = useCallback(() => {
    if (draftValue !== value) {
      onCommit(draftValue);
    }
  }, [draftValue, onCommit, value]);

  const handleChangeText = useCallback((nextValue: string) => {
    setDraftValue(normalizeApiKeysInputSingleLine(nextValue));
  }, []);

  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="none"
      autoCorrect={false}
      lineBreakModeIOS="clip"
      multiline={false}
      numberOfLines={1}
      onBlur={commitValue}
      onChangeText={handleChangeText}
      placeholder={placeholder}
      returnKeyType="done"
      selectTextOnFocus
      secureTextEntry={!isVisible}
      value={draftValue}
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

      <Button icon={<PlusIcon strokeWidth={2} />} onPress={onAdd} variant="secondary">
        {t('settings.provider.apiService.addApiKey')}
      </Button>
    </View>
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
    <TextField isDisabled={!apiKey.isEnabled} isInvalid={Boolean(errorMessage)}>
      <View className="min-h-8 flex-row items-center justify-between gap-3">
        <Label className="min-w-0 flex-1">{t('settings.provider.apiService.apiKey')}</Label>
        <Switch
          accessibilityLabel={t('settings.provider.apiService.apiKeyEnabled')}
          disabled={isPending}
          onValueChange={(isEnabled) => onEnabledChange(apiKey.id, isEnabled)}
          value={apiKey.isEnabled}
        />
      </View>
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1 overflow-hidden">
          <ApiKeyInput
            accessibilityLabel={t('settings.provider.apiService.apiKey')}
            value={apiKey.key}
            onChangeText={(key) => onKeyChange(apiKey.id, key)}
            onCommit={(key) => onCommitKey(apiKey.id, key)}
          />
        </View>
        <Button
          accessibilityLabel={t('settings.provider.apiService.copyApiKey')}
          disabled={isPending}
          hitSlop={2}
          icon={<CopyIcon strokeWidth={2} />}
          onPress={() => void Clipboard.setStringAsync(apiKey.key)}
          variant="secondary"
        />
        <Button
          accessibilityLabel={t('settings.provider.apiService.removeApiKey')}
          disabled={isPending}
          hitSlop={2}
          icon={<Trash2Icon strokeWidth={2} />}
          onPress={() => onRemove(apiKey.id)}
          variant="secondary"
        />
      </View>
      <FieldError>{errorMessage}</FieldError>
    </TextField>
  );
}

function ApiKeyInput({
  accessibilityLabel,
  onCommit,
  onChangeText,
  value,
}: {
  accessibilityLabel: string;
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
      lineBreakModeIOS="clip"
      multiline={false}
      numberOfLines={1}
      onChangeText={handleChangeText}
      onEndEditing={handleEndEditing}
      placeholder={t('settings.provider.apiService.apiKeyPlaceholder')}
      returnKeyType="done"
      selectTextOnFocus
      submitBehavior="blurAndSubmit"
      value={normalizedValue}
    />
  );
}

function normalizeApiKeysInputSingleLine(value: string): string {
  return value.replaceAll(/[\r\n]+/g, ',');
}

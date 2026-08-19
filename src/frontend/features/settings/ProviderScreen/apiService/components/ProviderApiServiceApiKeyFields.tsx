import { CopyIcon, KeyRoundIcon, PlusIcon, Trash2Icon } from '@cherrystudio/app-icons';
import {
  Button,
  FieldError,
  Input,
  Label,
  SecureInput,
  type SecureInputVisibilityAccessibilityLabels,
  Switch,
  TextField,
} from '@cherrystudio/ui/components';
import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { View } from 'react-native';

import { normalizeApiKeySingleLine } from '../utils/providerApiServiceApiKeys';

export function ProviderApiServiceApiKeysField({
  apiKeysInput,
  onCommit,
  onManagePress,
}: {
  apiKeysInput: string;
  onCommit: (value: string) => void;
  onManagePress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <TextField>
      {/* Semibold to match the `Section.Header` of the connectivity check right
          below it — heroui's own label default is only medium. */}
      <Label>
        <Label.Text className="font-semibold">
          {t('settings.provider.apiService.apiKeys')}
        </Label.Text>
      </Label>
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1 overflow-hidden">
          <ApiKeysCommitInput
            accessibilityLabel={t('settings.provider.apiService.apiKeys')}
            onCommit={onCommit}
            placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
            value={apiKeysInput}
            visibilityAccessibilityLabels={{
              hide: t('settings.provider.apiService.hideApiKeys'),
              show: t('settings.provider.apiService.showApiKeys'),
            }}
          />
        </View>
        <Button
          accessibilityLabel={t('settings.provider.apiService.manageApiKeys')}
          // Square, and exactly as tall as the field beside it — a button's own
          // padding lands two points short of an input's height.
          className="size-10 min-w-0 p-0"
          hitSlop={6}
          icon={<KeyRoundIcon />}
          onPress={onManagePress}
          variant="secondary"
        />
      </View>
    </TextField>
  );
}

function ApiKeysCommitInput({
  accessibilityLabel,
  onCommit,
  placeholder,
  value,
  visibilityAccessibilityLabels,
}: {
  accessibilityLabel: string;
  onCommit: (value: string) => void;
  placeholder: string;
  value: string;
  visibilityAccessibilityLabels: SecureInputVisibilityAccessibilityLabels;
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
    <SecureInput
      accessibilityLabel={accessibilityLabel}
      lineBreakModeIOS="clip"
      numberOfLines={1}
      onBlur={commitValue}
      onChangeText={handleChangeText}
      placeholder={placeholder}
      returnKeyType="done"
      selectTextOnFocus
      value={draftValue}
      visibilityAccessibilityLabels={visibilityAccessibilityLabels}
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

      <Button icon={<PlusIcon />} onPress={onAdd} variant="secondary">
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
          icon={<CopyIcon />}
          onPress={() => void Clipboard.setStringAsync(apiKey.key)}
          variant="secondary"
        />
        <Button
          accessibilityLabel={t('settings.provider.apiService.removeApiKey')}
          disabled={isPending}
          hitSlop={2}
          icon={<Trash2Icon />}
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

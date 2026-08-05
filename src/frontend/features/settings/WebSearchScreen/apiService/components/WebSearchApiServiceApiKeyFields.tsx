import { Button, FieldError, Input, Label, TextField } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-uniwind/png';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { View } from 'react-native';

import type { WebSearchApiKeyEntry } from '../utils/webSearchApiServiceApiKeys';

export function WebSearchApiServiceApiKeysField({
  apiKeysInput,
  apiKeysVisible,
  onApiKeysInputChange,
  onCheckPress,
  onManagePress,
  onToggleVisible,
}: {
  apiKeysInput: string;
  apiKeysVisible: boolean;
  onApiKeysInputChange: (value: string) => void;
  onCheckPress: () => void;
  onManagePress: () => void;
  onToggleVisible: () => void;
}) {
  const { t } = useTranslation();

  return (
    <TextField>
      <Label>{t('settings.websearch.provider.apiKeys')}</Label>
      <View className="flex-row items-start gap-2">
        <ApiKeysCommitInput
          accessibilityLabel={t('settings.websearch.provider.apiKeys')}
          onCommit={onApiKeysInputChange}
          placeholder={t('settings.websearch.provider.apiKeysPlaceholder')}
          secureTextEntry={!apiKeysVisible}
          value={apiKeysInput}
        />
        <Button
          accessibilityLabel={
            apiKeysVisible
              ? t('settings.websearch.provider.hideApiKeys')
              : t('settings.websearch.provider.showApiKeys')
          }
          hitSlop={6}
          icon={apiKeysVisible ? <EyeIcon strokeWidth={2} /> : <EyeOffIcon strokeWidth={2} />}
          onPress={onToggleVisible}
          variant="secondary"
        />
        <Button
          accessibilityLabel={t('settings.websearch.provider.manageApiKeys')}
          hitSlop={6}
          icon={<KeyRoundIcon strokeWidth={2} />}
          onPress={onManagePress}
          variant="secondary"
        />
        <Button
          accessibilityLabel={t('settings.websearch.provider.check')}
          hitSlop={6}
          icon={<ActivityIcon strokeWidth={2} />}
          onPress={onCheckPress}
          variant="secondary"
        />
      </View>
    </TextField>
  );
}

type ApiKeysCommitInputProps = {
  accessibilityLabel: string;
  onCommit: (value: string) => void;
  placeholder: string;
  secureTextEntry: boolean;
  value: string;
};

function ApiKeysCommitInput({
  accessibilityLabel,
  onCommit,
  placeholder,
  secureTextEntry,
  value,
}: ApiKeysCommitInputProps) {
  const [draftValue, setDraftValue] = useState(value);
  const [sourceValue, setSourceValue] = useState(value);
  const draftValueRef = useRef(draftValue);
  const onCommitRef = useRef(onCommit);
  const valueRef = useRef(value);

  if (sourceValue !== value) {
    setSourceValue(value);
    setDraftValue(value);
  }

  useEffect(() => {
    draftValueRef.current = value;
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const commitValue = useCallback((nextValue?: string) => {
    const resolvedValue = nextValue ?? draftValueRef.current;
    if (resolvedValue !== valueRef.current) {
      onCommitRef.current(resolvedValue);
      valueRef.current = resolvedValue;
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
    <View className="min-w-0 flex-1">
      <Input
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        onBlur={handleCommitEvent}
        onChangeText={handleChangeText}
        onEndEditing={handleEndEditing}
        onSubmitEditing={handleCommitEvent}
        placeholder={placeholder}
        returnKeyType="done"
        secureTextEntry={secureTextEntry}
        value={draftValue}
      />
    </View>
  );
}

export function WebSearchApiServiceApiKeyForm({
  apiKeys,
  apiKeyErrors,
  pendingApiKeyIds,
  onAdd,
  onCommitKey,
  onKeyChange,
  onRemove,
}: {
  apiKeys: readonly WebSearchApiKeyEntry[];
  apiKeyErrors?: Record<string, string>;
  pendingApiKeyIds?: ReadonlySet<string>;
  onAdd: () => void;
  onCommitKey: (id: string, key: string) => void;
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
              isPending={pendingApiKeyIds?.has(apiKey.id) ?? false}
              key={apiKey.id}
              onCommitKey={onCommitKey}
              onKeyChange={onKeyChange}
              onRemove={onRemove}
            />
          ))}
        </View>
      ) : null}

      <Button icon={<PlusIcon strokeWidth={2} />} onPress={onAdd} variant="secondary">
        {t('settings.websearch.provider.addApiKey')}
      </Button>
    </View>
  );
}

function ApiKeyRow({
  apiKey,
  errorMessage,
  isPending,
  onCommitKey,
  onKeyChange,
  onRemove,
}: {
  apiKey: WebSearchApiKeyEntry;
  errorMessage?: string;
  isPending: boolean;
  onCommitKey: (id: string, key: string) => void;
  onKeyChange: (id: string, key: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <TextField isDisabled={isPending} isInvalid={Boolean(errorMessage)}>
      <Label>{t('settings.websearch.provider.apiKey')}</Label>
      <View className="flex-row items-center gap-2">
        <ApiKeyInput
          accessibilityLabel={t('settings.websearch.provider.apiKey')}
          onChangeText={(key) => onKeyChange(apiKey.id, key)}
          onCommit={(key) => onCommitKey(apiKey.id, key)}
          value={apiKey.key}
        />
        <Button
          accessibilityLabel={t('settings.websearch.provider.copyApiKey')}
          disabled={isPending}
          hitSlop={6}
          icon={<CopyIcon strokeWidth={2} />}
          onPress={() => void Clipboard.setStringAsync(apiKey.key)}
          variant="secondary"
        />
        <Button
          accessibilityLabel={t('settings.websearch.provider.removeApiKey')}
          disabled={isPending}
          hitSlop={6}
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
      onCommit(event.nativeEvent.text);
    },
    [onCommit],
  );

  const handleCommitEvent = useCallback(() => {
    onCommit(value);
  }, [onCommit, value]);

  return (
    <View className="min-w-0 flex-1">
      <Input
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        onBlur={handleCommitEvent}
        onChangeText={onChangeText}
        onEndEditing={handleEndEditing}
        onSubmitEditing={handleCommitEvent}
        placeholder={t('settings.websearch.provider.apiKeyPlaceholder')}
        returnKeyType="done"
        value={value}
      />
    </View>
  );
}

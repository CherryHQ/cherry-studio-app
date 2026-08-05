import { FieldError, Input, Label, TextField } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { Button } from 'heroui-native/button';
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
import { Text, View } from 'react-native';

import { SettingsIconButton } from '../../../components/SettingsIconButton';
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
        <SettingsIconButton
          accessibilityLabel={
            apiKeysVisible
              ? t('settings.websearch.provider.hideApiKeys')
              : t('settings.websearch.provider.showApiKeys')
          }
          onPress={onToggleVisible}
        >
          <ApiKeysVisibilityIcon visible={apiKeysVisible} />
        </SettingsIconButton>
        <SettingsIconButton
          accessibilityLabel={t('settings.websearch.provider.manageApiKeys')}
          onPress={onManagePress}
        >
          <KeyRoundIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </SettingsIconButton>
        <SettingsIconButton
          accessibilityLabel={t('settings.websearch.provider.check')}
          onPress={onCheckPress}
        >
          <ActivityIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </SettingsIconButton>
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

      <Button
        className="h-10 min-h-10 flex-row items-center justify-center gap-2 rounded-xl"
        onPress={onAdd}
        variant="secondary"
      >
        <PlusIcon className="size-4 text-default-foreground" strokeWidth={2} />
        <Text className="text-base text-foreground">
          {t('settings.websearch.provider.addApiKey')}
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
        <SettingsIconButton
          accessibilityLabel={t('settings.websearch.provider.copyApiKey')}
          isDisabled={isPending}
          onPress={() => void Clipboard.setStringAsync(apiKey.key)}
        >
          <CopyIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </SettingsIconButton>
        <SettingsIconButton
          accessibilityLabel={t('settings.websearch.provider.removeApiKey')}
          isDisabled={isPending}
          onPress={() => onRemove(apiKey.id)}
        >
          <Trash2Icon className="size-5 text-default-foreground" strokeWidth={2} />
        </SettingsIconButton>
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

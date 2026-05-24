import * as Clipboard from 'expo-clipboard';
import { Button } from 'heroui-native/button';
import { Input } from 'heroui-native/input';
import { CopyIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, PlusIcon, Trash2Icon } from 'lucide-uniwind';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import type { WebSearchApiKeyEntry } from '../utils/webSearchApiServiceApiKeys';

export function WebSearchApiServiceApiKeysField({
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
        {t('settings.websearch.provider.apiKeys')}
      </Text>
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
          className="h-10 min-h-0 rounded-xl"
          isIconOnly
          onPress={onToggleVisible}
          variant="secondary"
        >
          <ApiKeysVisibilityIcon visible={apiKeysVisible} />
        </Button>
        <Button
          accessibilityLabel={t('settings.websearch.provider.manageApiKeys')}
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
      style={styles.input}
      value={draftValue}
      variant="secondary"
    />
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
    <View className="gap-1">
      <Text className="font-medium text-default-foreground text-sm">
        {t('settings.websearch.provider.apiKey')}
      </Text>
      <View className="flex-row items-center gap-2">
        <ApiKeyInput
          accessibilityLabel={t('settings.websearch.provider.apiKey')}
          isDisabled={isPending}
          onChangeText={(key) => onKeyChange(apiKey.id, key)}
          onCommit={(key) => onCommitKey(apiKey.id, key)}
          value={apiKey.key}
        />
        <Button
          accessibilityLabel={t('settings.websearch.provider.copyApiKey')}
          className={`h-10 min-h-0 rounded-xl ${isPending ? 'opacity-40' : ''}`}
          isDisabled={isPending}
          isIconOnly
          onPress={() => void Clipboard.setStringAsync(apiKey.key)}
          variant="secondary"
        >
          <CopyIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </Button>
        <Button
          accessibilityLabel={t('settings.websearch.provider.removeApiKey')}
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
      placeholder={t('settings.websearch.provider.apiKeyPlaceholder')}
      returnKeyType="done"
      style={styles.input}
      value={value}
      variant="secondary"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    height: 40,
    includeFontPadding: false,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
    verticalAlign: 'middle',
  },
});

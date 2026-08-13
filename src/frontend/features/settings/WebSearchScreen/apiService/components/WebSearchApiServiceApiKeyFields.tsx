import {
  Button,
  FieldError,
  Input,
  Label,
  SecureInput,
  type SecureInputVisibilityAccessibilityLabels,
  TextField,
} from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { ActivityIcon, CopyIcon, KeyRoundIcon, PlusIcon, Trash2Icon } from 'lucide-uniwind/png';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { View } from 'react-native';

import {
  parseWebSearchApiKeysInput,
  type WebSearchApiKeyEntry,
} from '../utils/webSearchApiServiceApiKeys';

export function WebSearchApiServiceApiKeysField({
  apiKeysInput,
  onApiKeysInputChange,
  onManagePress,
  onCheck,
  isChecking,
}: {
  apiKeysInput: string;
  onApiKeysInputChange: (value: string) => void;
  onManagePress: () => void;
  onCheck: (apiKey: string) => void;
  isChecking: boolean;
}) {
  const { t } = useTranslation();
  const [currentInput, setCurrentInput] = useState(apiKeysInput);
  const [sourceInput, setSourceInput] = useState(apiKeysInput);

  if (sourceInput !== apiKeysInput) {
    setSourceInput(apiKeysInput);
    setCurrentInput(apiKeysInput);
  }

  return (
    <TextField>
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1 overflow-hidden">
          <ApiKeysCommitInput
            accessibilityLabel={t('settings.websearch.provider.apiKeys')}
            blurOnVisibilityToggle
            onCommit={onApiKeysInputChange}
            onDraftChange={setCurrentInput}
            placeholder={t('settings.websearch.provider.apiKeysPlaceholder')}
            value={apiKeysInput}
            visibilityAccessibilityLabels={{
              hide: t('settings.websearch.provider.hideApiKeys'),
              show: t('settings.websearch.provider.showApiKeys'),
            }}
          />
        </View>
        <Button
          accessibilityLabel={t('settings.websearch.provider.manageApiKeys')}
          hitSlop={2}
          icon={<KeyRoundIcon strokeWidth={2} />}
          onPress={onManagePress}
          variant="secondary"
        />
        <Button
          accessibilityLabel={t('settings.websearch.provider.check')}
          disabled={!currentInput.trim()}
          hitSlop={2}
          icon={<ActivityIcon strokeWidth={2} />}
          loading={isChecking}
          onPress={() => {
            const apiKeys = parseWebSearchApiKeysInput(currentInput);
            onApiKeysInputChange(currentInput);
            onCheck(apiKeys[0] ?? '');
          }}
          variant="secondary"
        />
      </View>
    </TextField>
  );
}

type ApiKeysCommitInputProps = {
  accessibilityLabel: string;
  blurOnVisibilityToggle?: boolean;
  onCommit: (value: string) => void;
  onDraftChange: (value: string) => void;
  placeholder: string;
  value: string;
  visibilityAccessibilityLabels: SecureInputVisibilityAccessibilityLabels;
};

function ApiKeysCommitInput({
  accessibilityLabel,
  blurOnVisibilityToggle,
  onCommit,
  onDraftChange,
  placeholder,
  value,
  visibilityAccessibilityLabels,
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

  const handleChangeText = useCallback(
    (nextValue: string) => {
      draftValueRef.current = nextValue;
      setDraftValue(nextValue);
      onDraftChange(nextValue);
    },
    [onDraftChange],
  );

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
    <SecureInput
      accessibilityLabel={accessibilityLabel}
      blurOnVisibilityToggle={blurOnVisibilityToggle}
      lineBreakModeIOS="clip"
      numberOfLines={1}
      onBlur={handleCommitEvent}
      onChangeText={handleChangeText}
      onEndEditing={handleEndEditing}
      onSubmitEditing={handleCommitEvent}
      placeholder={placeholder}
      returnKeyType="done"
      selectTextOnFocus
      value={draftValue}
      visibilityAccessibilityLabels={visibilityAccessibilityLabels}
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
    <TextField isInvalid={Boolean(errorMessage)}>
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
          hitSlop={2}
          icon={<CopyIcon strokeWidth={2} />}
          onPress={() => void Clipboard.setStringAsync(apiKey.key)}
          variant="secondary"
        />
        <Button
          accessibilityLabel={t('settings.websearch.provider.removeApiKey')}
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
      onCommit(event.nativeEvent.text);
    },
    [onCommit],
  );

  return (
    <View className="min-w-0 flex-1">
      <Input
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeText}
        onEndEditing={handleEndEditing}
        placeholder={t('settings.websearch.provider.apiKeyPlaceholder')}
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        value={value}
      />
    </View>
  );
}

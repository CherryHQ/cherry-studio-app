import ActivityIcon from '@cherrystudio/app-icons/icons/activity';
import {
  Button,
  Input,
  type InputPasswordVisibilityAccessibilityLabels,
  TextField,
} from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputEndEditingEvent } from 'react-native';
import { View } from 'react-native';

import { parseWebSearchApiKeysInput } from '../utils/webSearchApiServiceApiKeys';

export function WebSearchApiServiceApiKeysField({
  apiKeysInput,
  onApiKeysInputChange,
  onCheck,
  isChecking,
}: {
  apiKeysInput: string;
  onApiKeysInputChange: (value: string) => void;
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
          accessibilityLabel={t('settings.websearch.provider.check')}
          disabled={!currentInput.trim()}
          hitSlop={2}
          icon={<ActivityIcon />}
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
  visibilityAccessibilityLabels: InputPasswordVisibilityAccessibilityLabels;
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
    <Input
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
      type="password"
      value={draftValue}
      visibilityAccessibilityLabels={visibilityAccessibilityLabels}
    />
  );
}

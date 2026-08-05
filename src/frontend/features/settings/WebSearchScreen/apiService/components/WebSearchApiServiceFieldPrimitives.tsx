import { Input } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextInputEndEditingEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

type SettingTextInputProps = {
  accessibilityLabel: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  value: string;
};

export function SettingTextInput({
  accessibilityLabel,
  onCommit,
  placeholder,
  secureTextEntry,
  value,
}: SettingTextInputProps) {
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
      style={styles.input}
      value={draftValue}
    />
  );
}

type ConfigFieldProps = {
  children: React.ReactNode;
  label: string;
};

export function ConfigField({ children, label }: ConfigFieldProps) {
  return (
    <View className="gap-2">
      <Text className="font-medium text-default-foreground text-sm">{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    includeFontPadding: false,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
    verticalAlign: 'middle',
  },
});

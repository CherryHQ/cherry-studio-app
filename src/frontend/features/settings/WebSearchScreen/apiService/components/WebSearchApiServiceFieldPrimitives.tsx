import { Input, Label, TextField } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StyleProp, TextInputEndEditingEvent, TextStyle } from 'react-native';

type SettingTextInputProps = {
  accessibilityLabel: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  secureTextEntry?: boolean;
  style?: StyleProp<TextStyle>;
  value: string;
};

export function SettingTextInput({
  accessibilityLabel,
  onCommit,
  multiline = false,
  placeholder,
  secureTextEntry,
  style,
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
      multiline={multiline}
      onBlur={handleCommitEvent}
      onChangeText={handleChangeText}
      onEndEditing={handleEndEditing}
      onSubmitEditing={multiline ? undefined : handleCommitEvent}
      placeholder={placeholder}
      returnKeyType={multiline ? 'default' : 'done'}
      secureTextEntry={secureTextEntry}
      style={style}
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
    <TextField>
      <Label>{label}</Label>
      {children}
    </TextField>
  );
}

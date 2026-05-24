import { Input } from 'heroui-native/input';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextInputEndEditingEvent } from 'react-native';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

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
  const draftValueRef = useRef(draftValue);
  const onCommitRef = useRef(onCommit);
  const valueRef = useRef(value);

  useEffect(() => {
    setDraftValue(value);
    draftValueRef.current = value;
  }, [value]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

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
      className="h-10 min-h-0 rounded-xl px-3 py-0 text-base leading-5"
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

type ExternalLinkRowProps = {
  label: string;
  url: string;
};

export function ExternalTextLink({ label, url }: ExternalLinkRowProps) {
  const handlePress = useCallback(() => {
    Linking.openURL(url).catch(() => undefined);
  }, [url]);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="link"
      className="py-1 active:opacity-60"
      onPress={handlePress}
    >
      <Text className="text-accent text-sm">{label}</Text>
    </Pressable>
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
    height: 40,
    includeFontPadding: false,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
    verticalAlign: 'middle',
  },
});

import { Input } from 'heroui-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

const numberInputWidth = 96;
const numberInputHeight = 32;

type SettingNumberInputProps = {
  accessibilityLabel: string;
  min?: number;
  onValueChange: (value: number) => void;
  value: number;
};

export function SettingNumberInput({
  accessibilityLabel,
  min = 1,
  onValueChange,
  value,
}: SettingNumberInputProps) {
  const [draftValue, setDraftValue] = useState(() => String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  const commitValue = useCallback(() => {
    const nextValue = Number(draftValue);

    if (!Number.isSafeInteger(nextValue) || nextValue < min) {
      setDraftValue(String(value));
      return;
    }

    if (nextValue !== value) {
      onValueChange(nextValue);
    }
  }, [draftValue, min, onValueChange, value]);

  const handleChangeText = useCallback((nextValue: string) => {
    setDraftValue(nextValue.replaceAll(/\D/g, ''));
  }, []);

  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      className="h-8 min-h-0 rounded-xl px-2 py-0 text-right text-base leading-5"
      inputMode="numeric"
      keyboardType="number-pad"
      onBlur={commitValue}
      onChangeText={handleChangeText}
      onSubmitEditing={commitValue}
      returnKeyType="done"
      style={[
        styles.input,
        {
          height: numberInputHeight,
          width: numberInputWidth,
        },
      ]}
      value={draftValue}
      variant="secondary"
    />
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

import { Input, TextField } from '@cherrystudio/ui/components';
import { useCallback, useState } from 'react';

type SettingNumberInputProps = {
  accessibilityLabel: string;
  compact?: boolean;
  min?: number;
  onValueChange: (value: number) => void;
  value: number;
};

export function SettingNumberInput({
  accessibilityLabel,
  compact = false,
  min = 1,
  onValueChange,
  value,
}: SettingNumberInputProps) {
  const [draftValue, setDraftValue] = useState(() => String(value));
  const [sourceValue, setSourceValue] = useState(value);

  if (sourceValue !== value) {
    setSourceValue(value);
    setDraftValue(String(value));
  }

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
    <TextField>
      <Input
        accessibilityLabel={accessibilityLabel}
        inputMode="numeric"
        keyboardType="number-pad"
        onBlur={commitValue}
        onChangeText={handleChangeText}
        onSubmitEditing={commitValue}
        returnKeyType="done"
        style={compact ? { height: 36, minHeight: 36, textAlign: 'center', width: 64 } : undefined}
        value={draftValue}
      />
    </TextField>
  );
}

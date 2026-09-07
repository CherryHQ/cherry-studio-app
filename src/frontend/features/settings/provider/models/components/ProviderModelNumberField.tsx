import { Input, TextField } from '@cherrystudio/ui/components';
import type { TextInputProps } from 'react-native';

/** Shared input for model token limits; each task owns validation and persistence. */
export function ProviderModelNumberField({
  disabled,
  errorMessage,
  label,
  onChangeText,
  onFocus,
  placeholder,
  value,
}: {
  disabled: boolean;
  errorMessage?: string;
  label: string;
  onChangeText: (value: string) => void;
  onFocus?: TextInputProps['onFocus'];
  placeholder: string;
  value: string;
}) {
  return (
    <TextField disabled={disabled} invalid={Boolean(errorMessage)}>
      <TextField.Label>{label}</TextField.Label>
      <Input
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="numeric"
        keyboardType="number-pad"
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        returnKeyType="done"
        value={value}
      />
      <TextField.Error>{errorMessage}</TextField.Error>
    </TextField>
  );
}

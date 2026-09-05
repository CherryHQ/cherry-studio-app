import { Input, TextField } from '@cherrystudio/ui/components';
import type { TextInputProps } from 'react-native';

/** Shared input for model token limits; each task owns validation and persistence. */
export function ProviderModelNumberField({
  disabled,
  label,
  onChangeText,
  onFocus,
  placeholder,
  value,
}: {
  disabled: boolean;
  label: string;
  onChangeText: (value: string) => void;
  onFocus?: TextInputProps['onFocus'];
  placeholder: string;
  value: string;
}) {
  return (
    <TextField disabled={disabled}>
      <TextField.Label>{label}</TextField.Label>
      <Input
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="numeric"
        keyboardType="number-pad"
        onChangeText={(text) => onChangeText(text.replaceAll(/\D/g, ''))}
        onFocus={onFocus}
        placeholder={placeholder}
        returnKeyType="done"
        value={value}
      />
    </TextField>
  );
}

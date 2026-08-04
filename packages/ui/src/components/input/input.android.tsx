import { Input as HeroInput } from 'heroui-native/input';

import type { InputProps } from './input.types';

export function Input({
  accessibilityLabel,
  autoCapitalize = 'sentences',
  autoCorrect = true,
  autoFocus = false,
  disabled = false,
  keyboardType,
  maxLength,
  onBlur,
  onChangeText,
  onFocus,
  onSubmitEditing,
  placeholder,
  returnKeyType,
  secureTextEntry = false,
  style,
  testID,
  value,
}: InputProps) {
  return (
    <HeroInput
      accessibilityLabel={accessibilityLabel}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      autoFocus={autoFocus}
      isDisabled={disabled}
      keyboardType={keyboardType}
      maxLength={maxLength}
      onBlur={onBlur}
      onChangeText={onChangeText}
      onFocus={onFocus}
      onSubmitEditing={onSubmitEditing}
      placeholder={placeholder}
      returnKeyType={returnKeyType}
      secureTextEntry={secureTextEntry}
      style={style}
      testID={testID}
      value={value}
    />
  );
}

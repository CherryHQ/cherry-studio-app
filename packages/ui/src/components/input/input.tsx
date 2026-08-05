import { Input as HeroInput } from 'heroui-native/input';
import { TextField } from 'heroui-native/text-field';

import type { InputProps } from './input.types';

export function Input({
  accessibilityLabel,
  autoCapitalize = 'sentences',
  autoCorrect = true,
  autoFocus = false,
  disabled = false,
  keyboardType,
  maxLength,
  multiline = false,
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
  const inputClassName = multiline
    ? 'min-h-8 rounded-md border border-border text-base shadow-none ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border'
    : value
      ? 'min-h-8 rounded-md border border-border py-0 text-base shadow-none ios:pb-2 ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border'
      : 'min-h-8 rounded-md border border-border py-0 text-base shadow-none ios:pb-1 ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border';

  return (
    <TextField isDisabled={disabled} testID={testID ? `${testID}-field` : undefined}>
      <HeroInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoFocus={autoFocus}
        className={inputClassName}
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
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
    </TextField>
  );
}

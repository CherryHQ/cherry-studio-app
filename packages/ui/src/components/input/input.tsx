import { Input as HeroInput } from 'heroui-native/input';
import { TextField } from 'heroui-native/text-field';
import { cn } from 'heroui-native/utils';
import { forwardRef } from 'react';
import type { TextInput } from 'react-native';

import type { InputProps } from './input.types';

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    accessibilityLabel,
    autoCapitalize = 'sentences',
    autoCorrect = true,
    autoFocus = false,
    disabled = false,
    invalid = false,
    keyboardType,
    multiline = false,
    onChangeText,
    returnKeyType,
    secureTextEntry = false,
    style,
    testID,
    value,
    ...inputProps
  },
  ref,
) {
  const inputClassName = cn(
    multiline
      ? 'min-h-10 rounded-md border border-border text-(length:--text-base) shadow-none ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border'
      : 'min-h-10 rounded-md border border-border py-0 text-(length:--text-base) shadow-none ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border',
    invalid &&
      'border-danger ios:outline-danger ios:focus:outline-danger android:border-danger android:focus:border-danger',
  );

  return (
    <TextField
      isDisabled={disabled}
      isInvalid={invalid}
      testID={testID ? `${testID}-field` : undefined}
    >
      <HeroInput
        ref={ref}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoFocus={autoFocus}
        className={inputClassName}
        {...inputProps}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        returnKeyType={returnKeyType}
        secureTextEntry={secureTextEntry}
        style={style}
        testID={testID}
        value={value}
      />
    </TextField>
  );
});

import { Host, SecureField, TextField, useNativeState } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as accessibilityLabelModifier,
  autocorrectionDisabled,
  disabled as disabledModifier,
  keyboardType as keyboardTypeModifier,
  onSubmit,
  submitLabel,
  textFieldStyle,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
import { useEffect } from 'react';
import { useUniwind } from 'uniwind';

import type { InputAutoCapitalize, InputProps } from './input.types';

const autoCapitalization: Record<
  InputAutoCapitalize,
  'characters' | 'never' | 'sentences' | 'words'
> = {
  characters: 'characters',
  none: 'never',
  sentences: 'sentences',
  words: 'words',
};

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
  const { theme } = useUniwind();
  const nativeText = useNativeState(value);

  useEffect(() => {
    if (nativeText.get() !== value) {
      nativeText.set(value);
    }
  }, [nativeText, value]);

  const modifiers = [
    textFieldStyle('roundedBorder'),
    accessibilityLabelModifier(accessibilityLabel),
    disabledModifier(disabled),
    autocorrectionDisabled(!autoCorrect),
    textInputAutocapitalization(autoCapitalization[autoCapitalize]),
    ...(keyboardType ? [keyboardTypeModifier(keyboardType)] : []),
    ...(returnKeyType ? [submitLabel(returnKeyType)] : []),
    ...(onSubmitEditing ? [onSubmit(onSubmitEditing)] : []),
  ];
  const handleFocusChange =
    onFocus || onBlur
      ? (isFocused: boolean) => {
          if (isFocused) {
            onFocus?.();
          } else {
            onBlur?.();
          }
        }
      : undefined;
  const fieldProps = {
    autoFocus,
    maxLength,
    modifiers,
    onFocusChange: handleFocusChange,
    onTextChange: onChangeText,
    placeholder,
    testID,
    text: nativeText,
  };

  return (
    <Host
      colorScheme={theme === 'dark' ? 'dark' : 'light'}
      matchContents={{ vertical: true }}
      style={[{ alignSelf: 'stretch' }, style]}
      testID={testID ? `${testID}-host` : undefined}
    >
      {secureTextEntry ? <SecureField {...fieldProps} /> : <TextField {...fieldProps} />}
    </Host>
  );
}

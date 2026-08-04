import { Button, Host, HStack, Image, TextField, useNativeState } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityLabel as accessibilityLabelModifier,
  autocorrectionDisabled,
  background,
  buttonStyle,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  labelStyle,
  onSubmit,
  padding,
  shapes,
  submitLabel,
  textFieldStyle,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
import { useEffect } from 'react';
import { PlatformColor } from 'react-native';
import { useUniwind } from 'uniwind';

import type { SearchFieldProps } from './search-field.types';

const secondaryForeground = { type: 'hierarchical', style: 'secondary' } as const;

export function SearchField({
  accessibilityLabel,
  autoFocus = false,
  clearAccessibilityLabel,
  disabled = false,
  onBlur,
  onChangeText,
  onClear,
  onFocus,
  onSubmitEditing,
  placeholder,
  style,
  testID,
  value,
}: SearchFieldProps) {
  const { theme } = useUniwind();
  const nativeText = useNativeState(value);

  useEffect(() => {
    if (nativeText.get() !== value) {
      nativeText.set(value);
    }
  }, [nativeText, value]);

  const handleClear = () => {
    nativeText.set('');
    onChangeText('');
    onClear?.();
  };
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
  const fieldModifiers = [
    textFieldStyle('plain'),
    accessibilityLabelModifier(accessibilityLabel),
    autocorrectionDisabled(),
    textInputAutocapitalization('never'),
    submitLabel('search'),
    ...(onSubmitEditing ? [onSubmit(onSubmitEditing)] : []),
  ];

  return (
    <Host
      colorScheme={theme === 'dark' ? 'dark' : 'light'}
      matchContents={{ vertical: true }}
      style={[{ alignSelf: 'stretch' }, style]}
      testID={testID ? `${testID}-host` : undefined}
    >
      <HStack
        alignment="center"
        modifiers={[
          frame({ alignment: 'leading', maxWidth: Infinity }),
          padding({ horizontal: 10, vertical: 8 }),
          background(
            PlatformColor('tertiarySystemFill'),
            shapes.roundedRectangle({ cornerRadius: 10, roundedCornerStyle: 'continuous' }),
          ),
          disabledModifier(disabled),
        ]}
        spacing={8}
      >
        <Image
          modifiers={[
            font({ textStyle: 'body' }),
            foregroundStyle(secondaryForeground),
            accessibilityHidden(),
          ]}
          systemName="magnifyingglass"
        />
        <TextField
          autoFocus={autoFocus}
          modifiers={fieldModifiers}
          onFocusChange={handleFocusChange}
          onTextChange={onChangeText}
          placeholder={placeholder}
          testID={testID}
          text={nativeText}
        />
        {value ? (
          <Button
            label={clearAccessibilityLabel}
            modifiers={[
              buttonStyle('plain'),
              labelStyle('iconOnly'),
              font({ textStyle: 'body' }),
              foregroundStyle(secondaryForeground),
              accessibilityLabelModifier(clearAccessibilityLabel),
            ]}
            onPress={handleClear}
            systemImage="xmark.circle.fill"
            testID={testID ? `${testID}-clear` : undefined}
          />
        ) : null}
      </HStack>
    </Host>
  );
}

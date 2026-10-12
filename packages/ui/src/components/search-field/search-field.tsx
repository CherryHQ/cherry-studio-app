import { SearchField as HeroSearchField } from 'heroui-native/search-field';
import { useRef } from 'react';
import { Pressable, StyleSheet, type TextInput } from 'react-native';

import { useFieldText } from '../input/use-field-text';
import type { SearchFieldProps } from './search-field.types';

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
  variant = 'default',
}: SearchFieldProps) {
  const [text, changeText] = useFieldText(value, onChangeText);
  const inputRef = useRef<TextInput>(null);

  return (
    <HeroSearchField
      isDisabled={disabled}
      onChange={changeText}
      style={style}
      testID={testID ? `${testID}-root` : undefined}
      value={text}
    >
      <Pressable
        accessible={false}
        disabled={disabled}
        focusable={false}
        onPress={() => inputRef.current?.focus()}
      >
        <HeroSearchField.Group
          className={
            variant === 'filled'
              ? 'min-h-12 rounded-full bg-card shadow-sm'
              : 'min-h-10 rounded-full border border-border bg-field'
          }
        >
          <HeroSearchField.SearchIcon />
          <HeroSearchField.Input
            ref={inputRef}
            accessibilityLabel={accessibilityLabel}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={autoFocus}
            className="min-h-0 border-0 bg-transparent py-0 text-(length:--text-base) shadow-none ios:shadow-none ios:focus:outline-transparent android:border-0 android:shadow-none android:focus:border-0"
            onBlur={onBlur}
            onFocus={onFocus}
            onSubmitEditing={onSubmitEditing}
            placeholder={placeholder}
            returnKeyType="search"
            style={styles.input}
            testID={testID}
          />
          <HeroSearchField.ClearButton
            accessibilityLabel={clearAccessibilityLabel}
            onPress={onClear}
            testID={testID ? `${testID}-clear` : undefined}
          />
        </HeroSearchField.Group>
      </Pressable>
    </HeroSearchField>
  );
}

const styles = StyleSheet.create({
  input: {
    // The group centers the native single-line field at its intrinsic height.
    // textAlignVertical does not center an expanded UITextField on iOS.
    includeFontPadding: false,
    textAlignVertical: 'center',
    verticalAlign: 'middle',
  },
});

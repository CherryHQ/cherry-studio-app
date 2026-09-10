import { SearchField as HeroSearchField } from 'heroui-native/search-field';
import { StyleSheet } from 'react-native';

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
  ref,
  style,
  testID,
  value,
  variant = 'default',
}: SearchFieldProps) {
  return (
    <HeroSearchField
      isDisabled={disabled}
      onChange={onChangeText}
      style={style}
      testID={testID ? `${testID}-root` : undefined}
      value={value}
    >
      <HeroSearchField.Group>
        <HeroSearchField.SearchIcon />
        <HeroSearchField.Input
          accessibilityLabel={accessibilityLabel}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          className={
            variant === 'filled'
              ? 'min-h-12 rounded-full border-0 bg-card py-0 text-(length:--text-base) shadow-sm ios:shadow-sm ios:focus:outline-transparent android:border-0 android:shadow-sm android:focus:border-0'
              : 'min-h-10 rounded-full border border-border py-0 text-(length:--text-base) shadow-none ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border'
          }
          onBlur={onBlur}
          onFocus={onFocus}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          ref={ref}
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
    </HeroSearchField>
  );
}

const styles = StyleSheet.create({
  input: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    verticalAlign: 'middle',
  },
});

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
  style,
  testID,
  value,
}: SearchFieldProps) {
  const inputClassName = value
    ? 'min-h-10 rounded-full border border-border py-0 text-base shadow-none ios:pb-2 ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border'
    : 'min-h-10 rounded-full border border-border py-0 text-base shadow-none ios:pb-1 ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border';

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
          className={inputClassName}
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

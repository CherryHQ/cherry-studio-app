import { SearchField as HeroSearchField } from 'heroui-native/search-field';

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
          onBlur={onBlur}
          onFocus={onFocus}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          returnKeyType="search"
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

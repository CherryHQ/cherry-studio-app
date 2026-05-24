import { SearchField } from 'heroui-native/search-field';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

const AnimatedSearchIcon = Animated.createAnimatedComponent(SearchField.SearchIcon);

type DrawerSearchFieldProps = {
  editable?: boolean;
  height: number;
  inputRef?: Ref<TextInput>;
  onChange: (value: string) => void;
  searchIconStyle?: AnimatedStyle<ViewStyle>;
  value: string;
};

export function DrawerSearchField({
  editable = true,
  height,
  inputRef,
  onChange,
  searchIconStyle,
  value,
}: DrawerSearchFieldProps) {
  const { t } = useTranslation();

  return (
    <SearchField className="w-full" onChange={onChange} value={value}>
      <SearchField.Group style={{ height }}>
        <AnimatedSearchIcon iconProps={{ size: 18 }} style={searchIconStyle} />
        <SearchField.Input
          ref={inputRef}
          accessibilityLabel={t('navigation.search')}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          className="rounded-3xl border-0 py-0 pl-9 pr-3 text-base leading-5"
          editable={editable}
          placeholder=""
          pointerEvents={editable ? 'auto' : 'none'}
          returnKeyType="search"
          spellCheck={false}
          style={[styles.input, { height, minHeight: height }]}
          textContentType="none"
        />
      </SearchField.Group>
    </SearchField>
  );
}

const styles = StyleSheet.create({
  input: {
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});

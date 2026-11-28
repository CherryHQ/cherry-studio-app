import CheckIcon from '@cherrystudio/app-icons/icons/check';
import {
  BottomSheet,
  type BottomSheetSize,
  type BottomSheetSizes,
  SearchField,
} from '@cherrystudio/ui/components';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProviderAvatar } from '@/frontend/components/Avatar';
import type { Provider } from '@/shared/data/types/provider';

const providerPickerSizes = ['medium', 'full'] as const satisfies BottomSheetSizes;

export type ProviderPickerItem = {
  key: string;
  provider: Pick<Provider, 'id' | 'name' | 'presetProviderId'>;
};

type ProviderPickerDrawerProps = {
  children?: ReactNode;
  emptyText: string;
  isLoading: boolean;
  loadingText: string;
  onClose: () => void;
  onSearchTextChange: (value: string) => void;
  onSelect: (item: ProviderPickerItem) => void;
  open: boolean;
  providers: readonly ProviderPickerItem[];
  searchPlaceholder: string;
  searchText: string;
  selectedProviderKey: string | null;
  title: string;
};

/** Provider selection follows the model picker's sheet, search and identity-row contract. */
export function ProviderPickerDrawer({
  children,
  emptyText,
  isLoading,
  loadingText,
  onClose,
  onSearchTextChange,
  onSelect,
  open,
  providers,
  searchPlaceholder,
  searchText,
  selectedProviderKey,
  title,
}: ProviderPickerDrawerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [sheetSize, setSheetSize] = useState<BottomSheetSize>('medium');
  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: 24 + insets.bottom }),
    [insets.bottom],
  );
  const handleSearchFocus = useCallback(() => setSheetSize('full'), []);
  const resetPicker = useCallback(() => {
    setSheetSize('medium');
    onSearchTextChange('');
  }, [onSearchTextChange]);
  const closePicker = useCallback(() => {
    resetPicker();
    onClose();
  }, [onClose, resetPicker]);

  return (
    <BottomSheet
      avoidKeyboard
      bodyInset="none"
      onClose={closePicker}
      onClosed={resetPicker}
      onSizeChange={setSheetSize}
      open={open}
      presentation="default"
      size={sheetSize}
      sizes={providerPickerSizes}
      testID="provider-picker"
      title={title}
    >
      <View className="min-h-0 flex-1">
        <View className="flex-row items-center gap-2 px-5 pb-2">
          <View className="min-w-0 flex-1">
            <SearchField
              accessibilityLabel={searchPlaceholder}
              clearAccessibilityLabel={t('common.clear')}
              onChangeText={onSearchTextChange}
              onClear={() => onSearchTextChange('')}
              onFocus={handleSearchFocus}
              onSubmitEditing={Keyboard.dismiss}
              placeholder={searchPlaceholder}
              testID="provider-picker-search"
              value={searchText}
              variant="subtle"
            />
          </View>
        </View>
        <ScrollView
          contentContainerClassName="gap-1"
          contentContainerStyle={contentContainerStyle}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {providers.map((item) => {
            const isSelected = selectedProviderKey === item.key;
            return (
              <Pressable
                accessibilityLabel={item.provider.name}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className="min-h-12 flex-row items-center gap-3 px-6 active:opacity-60"
                key={item.key}
                onPress={() => onSelect(item)}
              >
                <ProviderAvatar
                  presetProviderId={item.provider.presetProviderId}
                  providerId={item.provider.id}
                  providerName={item.provider.name}
                  size={32}
                />
                <Text className="min-w-0 flex-1 text-base text-foreground" numberOfLines={2}>
                  {item.provider.name}
                </Text>
                {isSelected ? <CheckIcon className="size-5 shrink-0 text-foreground" /> : null}
              </Pressable>
            );
          })}
          {providers.length === 0 ? (
            <View className="items-center justify-center px-6 py-8">
              <Text className="text-center text-base text-muted-foreground">
                {isLoading ? loadingText : emptyText}
              </Text>
            </View>
          ) : null}
          {children}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

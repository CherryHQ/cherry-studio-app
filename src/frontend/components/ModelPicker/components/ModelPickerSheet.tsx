import { BottomSheet, type BottomSheetSize, SearchField } from '@cherrystudio/ui/components';
import { type ReactNode, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';

const sizes = ['medium', 'full'] as const;

export function ModelPickerSheet({
  open,
  title,
  onClose,
  onReset,
  headerAction,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  onClose(): void;
  onReset(): void;
  headerAction?: ReactNode;
  footer?: ReactNode;
  children(actions: { expand(): void; close(): void }): ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [size, setSize] = useState<BottomSheetSize>('medium');
  if (open && !mounted) setMounted(true);
  const expand = useCallback(() => setSize('full'), []);
  const reset = useCallback(() => {
    setSize('medium');
    onReset();
  }, [onReset]);
  const close = useCallback(() => {
    reset();
    setMounted(false);
    onClose();
  }, [reset, onClose]);
  if (!mounted) return null;
  return (
    <BottomSheet
      avoidKeyboard
      bodyInset="none"
      footer={footer}
      headerAction={headerAction}
      onClose={close}
      onClosed={() => {
        reset();
        if (!open) setMounted(false);
      }}
      onSizeChange={setSize}
      open={open}
      presentation="default"
      size={size}
      sizes={sizes}
      testID="model-picker"
      title={title}
    >
      {children({ expand, close })}
    </BottomSheet>
  );
}

export function ModelPickerSearch({
  value,
  onChange,
  onFocus,
  children,
}: {
  value: string;
  onChange(value: string): void;
  onFocus(): void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-2 px-5 pb-2">
      <View className="min-w-0 flex-1">
        <SearchField
          accessibilityLabel={t('modelPicker.searchPlaceholder')}
          clearAccessibilityLabel={t('common.clear')}
          onChangeText={onChange}
          onClear={() => onChange('')}
          onFocus={onFocus}
          onSubmitEditing={Keyboard.dismiss}
          placeholder={t('modelPicker.searchPlaceholder')}
          testID="model-picker-search"
          value={value}
          variant="subtle"
        />
      </View>
      {children}
    </View>
  );
}

import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import { ActionMenu, Button, type MenuItem } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export type ShareFormat = 'original' | 'image' | 'html' | 'markdown' | 'pptx';

export function ShareFormatMenu({
  formats,
  format,
  disabled,
  onSelect,
}: {
  formats: readonly ShareFormat[];
  format: ShareFormat;
  disabled: boolean;
  onSelect(format: ShareFormat): void;
}) {
  const { t } = useTranslation();
  const label = (value: ShareFormat) =>
    value === 'original'
      ? t('sharing.original')
      : value === 'pptx'
        ? 'PPT'
        : t(`documentExport.formats.${value}`);
  const items: MenuItem[] = formats.map((value) => ({
    id: value,
    label: label(value),
    checked: format === value,
    disabled,
    onPress: () => onSelect(value),
  }));
  return (
    <ActionMenu items={items}>
      <Button
        accessibilityLabel={t('documentExport.format')}
        disabled={disabled}
        size="sm"
        variant="ghost"
      >
        <View className="flex-row items-center gap-1">
          <Text className="text-muted-foreground text-sm">{label(format)}</Text>
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </View>
      </Button>
    </ActionMenu>
  );
}

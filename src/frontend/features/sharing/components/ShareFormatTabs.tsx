import CodeXmlIcon from '@cherrystudio/app-icons/icons/code-xml';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import HashIcon from '@cherrystudio/app-icons/icons/hash';
import ImageIcon from '@cherrystudio/app-icons/icons/image';
import PresentationIcon from '@cherrystudio/app-icons/icons/presentation';
import { Tabs } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

export type ShareFormat = 'original' | 'image' | 'html' | 'markdown' | 'pptx';

const FORMAT_ICONS = {
  original: FileTextIcon,
  image: ImageIcon,
  html: CodeXmlIcon,
  markdown: HashIcon,
  pptx: PresentationIcon,
};

/** Floats over the preview; the caller owns its bottom inset and format state. */
export function ShareFormatTabs({
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
  return (
    <ScrollView
      horizontal
      style={{ flexGrow: 0 }}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16 }}
    >
      <Tabs
        accessibilityLabel={t('documentExport.format')}
        layout="hug"
        variant="floating"
        value={format}
        onValueChange={onSelect}
        items={formats.map((value) => {
          const Icon = FORMAT_ICONS[value];
          return {
            value,
            label: label(value),
            disabled,
            children: (
              <ShareFormatLabel Icon={Icon} selected={value === format} label={label(value)} />
            ),
          };
        })}
      />
    </ScrollView>
  );
}

function ShareFormatLabel({
  Icon,
  selected,
  label,
}: {
  Icon: typeof ImageIcon;
  selected: boolean;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon className={selected ? 'size-4 text-foreground' : 'size-4 text-muted-foreground'} />
      <Text
        className={
          selected
            ? 'font-medium text-foreground text-sm'
            : 'font-medium text-muted-foreground text-sm'
        }
      >
        {label}
      </Text>
    </View>
  );
}

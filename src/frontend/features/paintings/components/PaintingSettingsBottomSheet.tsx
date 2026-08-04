import type { CanonicalParamKey } from '@cherrystudio/provider-registry';
import { Slider, Switch } from '@cherrystudio/ui/components';
import { Input } from 'heroui-native/input';
import { Select } from 'heroui-native/select';
import type { TFunction } from 'i18next';
import { ChevronDownIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/frontend/components/bottomSheet';
import { SlotText } from '@/frontend/components/SlotText';
import { bottomSheet } from '@/frontend/utils/constants';

import { imageParamLabel, imageParamOptionLabel } from '../utils/imageGenerationLabels';
import type {
  ImageParamDraft,
  ImageParamField,
  ResolvedImageGenerationMode,
} from '../utils/imageGenerationParams';
import { getImageParamFields } from '../utils/imageGenerationParams';

const FIELD_GAP = 8;
// 固定 5 列等宽网格，超出自动换行；cell 恒定方形保证选中态切换时兄弟选项不挪位。
const RATIO_GRID_COLUMNS = 5;
// 外壳（选中框）固定为正方形，边长 = 单元格宽；1:1 预览方形为其一半，
// 其它比例按等面积缩放（观感大小一致），并收进外壳内边距。
const RATIO_SHELL_INSET = 20;

type PaintingSettingsBottomSheetProps = {
  onDismiss: () => void;
  onValueChange: (key: string, value: unknown) => void;
  resolvedMode: ResolvedImageGenerationMode;
  values: ImageParamDraft;
};

export function PaintingSettingsBottomSheet({
  onDismiss,
  onValueChange,
  resolvedMode,
  values,
}: PaintingSettingsBottomSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const fields = getImageParamFields(resolvedMode);
  const sheetWidth = Math.max(0, windowWidth - bottomSheet.outerInset * 2);
  const availableHeight = windowHeight - insets.top - insets.bottom - bottomSheet.outerInset * 2;
  const sheetHeight = Math.min(680, Math.max(360, availableHeight * 0.78));
  const fieldWidth = Math.max(0, sheetWidth - 48);

  return (
    <BottomSheet
      closeAccessibilityLabel={t('painting.settings.close')}
      height={sheetHeight}
      onClose={onDismiss}
      testID="painting-settings"
      title={t('painting.settings.title')}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(24, insets.bottom + 12) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {fields.map((field) => (
          <PaintingSettingField
            field={field}
            fieldWidth={fieldWidth}
            fields={fields}
            key={field.key}
            onValueChange={onValueChange}
            values={values}
          />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

function PaintingSettingField({
  field,
  fieldWidth,
  fields,
  onValueChange,
  values,
}: {
  field: ImageParamField;
  fieldWidth: number;
  fields: readonly ImageParamField[];
  onValueChange: (key: string, value: unknown) => void;
  values: ImageParamDraft;
}) {
  const { t } = useTranslation();
  const label = imageParamLabel(t, field.key);
  const value = values[field.key];

  switch (field.spec.type) {
    case 'switch':
      return (
        <View className="flex-row items-center justify-between gap-4 py-1">
          <Text className="min-w-0 flex-1 font-medium text-foreground text-sm">{label}</Text>
          <Switch
            accessibilityLabel={label}
            onValueChange={(selected) => onValueChange(field.key, selected)}
            value={Boolean(value)}
          />
        </View>
      );
    case 'enum': {
      if (field.spec.render !== 'chips') {
        return (
          <EnumSelectField
            field={{ key: field.key, spec: field.spec }}
            fields={fields}
            onValueChange={onValueChange}
            values={values}
          />
        );
      }
      const options = enumOptions(field, fields);
      // 比例/尺寸型字段（如 2:3、1024x1024）走截图式比例卡片；auto/custom
      // 等不可解析项在卡片里渲染成虚线占位，纯文字型字段回退普通 chips。
      return options.filter((option) => parseRatio(option)).length >= 2 ? (
        <AspectRatioField
          field={{ key: field.key, spec: field.spec }}
          fieldWidth={fieldWidth}
          onValueChange={onValueChange}
          options={options}
          values={values}
        />
      ) : (
        <EnumChipsField
          field={{ key: field.key, spec: field.spec }}
          fieldWidth={fieldWidth}
          fields={fields}
          onValueChange={onValueChange}
          values={values}
        />
      );
    }
    case 'range': {
      const numericValue = typeof value === 'number' ? value : Number(value ?? field.spec.min);
      return (
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-medium text-foreground text-sm">{label}</Text>
            <Text className="text-default-foreground text-sm" style={styles.tabularText}>
              {numericValue}
            </Text>
          </View>
          <Slider
            accessibilityLabel={label}
            max={field.spec.max}
            min={field.spec.min}
            onValueChange={(nextValue) => onValueChange(field.key, nextValue)}
            step={field.spec.step ?? 1}
            value={numericValue}
          />
        </View>
      );
    }
    case 'text':
      return (
        <View className="gap-2">
          <Text className="font-medium text-foreground text-sm">{label}</Text>
          <Input
            accessibilityLabel={label}
            autoCapitalize="none"
            autoCorrect={false}
            className={
              field.spec.multiline ? 'min-h-24 rounded-xl px-3 py-2' : 'h-10 rounded-xl px-3 py-0'
            }
            keyboardType={numericTextKeys.has(field.key) ? 'numbers-and-punctuation' : 'default'}
            multiline={field.spec.multiline}
            onChangeText={(nextValue) => onValueChange(field.key, nextValue)}
            placeholder={t('painting.settings.optional')}
            textAlignVertical={field.spec.multiline ? 'top' : 'center'}
            value={value === undefined || value === null ? '' : String(value)}
            variant="secondary"
          />
        </View>
      );
    case 'size':
      return (
        <CustomSizeField
          field={{ key: field.key, spec: field.spec }}
          fields={fields}
          onValueChange={onValueChange}
          values={values}
        />
      );
  }
}

function AspectRatioField({
  field,
  fieldWidth,
  onValueChange,
  options,
  values,
}: {
  field: ImageParamField & { spec: Extract<ImageParamField['spec'], { type: 'enum' }> };
  fieldWidth: number;
  onValueChange: (key: string, value: unknown) => void;
  options: readonly string[];
  values: ImageParamDraft;
}) {
  const { t } = useTranslation();
  const selectedValue = values[field.key];
  const selectedOption = typeof selectedValue === 'string' ? selectedValue : undefined;
  // 右侧始终原样显示选中比例（auto/custom 显示选项名）。
  const headerText = selectedOption ? ratioOptionLabel(t, field.key, selectedOption) : '';
  const cellWidth = Math.max(
    48,
    (fieldWidth - 32 - FIELD_GAP * (RATIO_GRID_COLUMNS - 1)) / RATIO_GRID_COLUMNS,
  );
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-medium text-foreground text-sm">{imageParamLabel(t, field.key)}</Text>
        <SlotText text={headerText} textClassName="font-medium text-default-foreground text-sm" />
      </View>
      <View className="rounded-3xl bg-surface-secondary p-4">
        <View className="flex-row flex-wrap" style={styles.chipGrid}>
          {options.map((option) => (
            <AspectRatioOption
              cellWidth={cellWidth}
              isSelected={selectedValue === option}
              key={option}
              label={ratioOptionLabel(t, field.key, option)}
              onPress={() => onValueChange(field.key, option)}
              value={option}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function AspectRatioOption({
  cellWidth,
  isSelected,
  label,
  onPress,
  value,
}: {
  cellWidth: number;
  isSelected: boolean;
  label: string;
  onPress: () => void;
  value: string;
}) {
  // 外壳固定正方形（边长 = 单元格宽）；1:1 预览方形恰为其一半。
  const shellSide = cellWidth;
  const squareSide = shellSide / 2;
  const ratio = parseRatio(value);
  const shapeStyle = ratio
    ? ratioShapeSize(ratio, squareSide * squareSide, shellSide - RATIO_SHELL_INSET)
    : { height: squareSide, width: squareSide };
  // auto/custom 等没有固定比例的选项画成虚线方框。
  const shape = ratio ? (
    <View
      className={
        isSelected
          ? 'rounded-sm bg-foreground'
          : 'rounded-sm border border-foreground/25 bg-foreground/10'
      }
      style={shapeStyle}
    />
  ) : (
    <View
      className={
        isSelected
          ? 'rounded-sm border-2 border-foreground'
          : 'rounded-sm border-2 border-foreground/25'
      }
      style={[shapeStyle, styles.ratioDashedShape]}
    />
  );
  const shellStyle = { height: shellSide, width: shellSide };
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className="items-center gap-2 active:opacity-70"
      onPress={onPress}
      style={{ width: cellWidth }}
    >
      <View className="items-center justify-center" style={shellStyle}>
        {isSelected ? (
          <View
            className="items-center justify-center rounded-xl border-2 border-foreground"
            style={shellStyle}
          >
            {shape}
          </View>
        ) : (
          shape
        )}
      </View>
      <Text
        className={
          isSelected
            ? 'font-semibold text-foreground text-sm'
            : 'font-medium text-default-foreground text-sm'
        }
        numberOfLines={1}
        style={styles.tabularText}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EnumChipsField({
  field,
  fieldWidth,
  fields,
  onValueChange,
  values,
}: {
  field: ImageParamField & { spec: Extract<ImageParamField['spec'], { type: 'enum' }> };
  fieldWidth: number;
  fields: readonly ImageParamField[];
  onValueChange: (key: string, value: unknown) => void;
  values: ImageParamDraft;
}) {
  const { t } = useTranslation();
  const options = enumOptions(field, fields);
  const columns = Math.min(field.spec.columns ?? 3, Math.max(1, options.length));
  const chipWidth = Math.max(72, (fieldWidth - FIELD_GAP * (columns - 1)) / columns);
  return (
    <View className="gap-2">
      <Text className="font-medium text-foreground text-sm">{imageParamLabel(t, field.key)}</Text>
      <View className="flex-row flex-wrap" style={styles.chipGrid}>
        {options.map((option) => {
          const isSelected = values[field.key] === option;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className={
                isSelected
                  ? 'h-14 items-center justify-center gap-1 rounded-lg border border-primary bg-primary/10 px-2 active:opacity-70'
                  : 'h-14 items-center justify-center gap-1 rounded-lg border border-border bg-surface-secondary px-2 active:opacity-70'
              }
              key={option}
              onPress={() => onValueChange(field.key, option)}
              style={{ width: chipWidth }}
            >
              <RatioPreview value={option} />
              <Text
                className={isSelected ? 'text-primary text-xs' : 'text-foreground text-xs'}
                numberOfLines={1}
              >
                {imageParamOptionLabel(t, field.key, option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function EnumSelectField({
  field,
  fields,
  onValueChange,
  values,
}: {
  field: ImageParamField & { spec: Extract<ImageParamField['spec'], { type: 'enum' }> };
  fields: readonly ImageParamField[];
  onValueChange: (key: string, value: unknown) => void;
  values: ImageParamDraft;
}) {
  const { t } = useTranslation();
  const label = imageParamLabel(t, field.key);
  const options = enumOptions(field, fields);
  const selectedValue = values[field.key];
  const selected =
    selectedValue === undefined
      ? undefined
      : {
          label: imageParamOptionLabel(t, field.key, String(selectedValue)),
          value: String(selectedValue),
        };
  return (
    <View className="gap-2">
      <Text className="font-medium text-foreground text-sm">{label}</Text>
      <Select onValueChange={(option) => onValueChange(field.key, option?.value)} value={selected}>
        <Select.Trigger
          accessibilityLabel={label}
          className="h-11 flex-row items-center rounded-xl bg-surface-secondary px-3 shadow-none"
        >
          <Select.Value
            className="min-w-0 flex-1 text-sm text-foreground"
            numberOfLines={1}
            placeholder={t('painting.settings.select')}
          >
            {selected?.label ?? t('painting.settings.select')}
          </Select.Value>
          <ChevronDownIcon className="size-4 text-default-foreground" strokeWidth={2} />
        </Select.Trigger>
        <Select.Portal>
          <Select.Overlay />
          <Select.Content className="max-h-64 p-2" presentation="popover" width="trigger">
            {options.map((option) => (
              <Select.Item
                key={option}
                label={imageParamOptionLabel(t, field.key, option)}
                value={option}
              >
                <Select.ItemLabel className="flex-1 text-sm" numberOfLines={1} />
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Portal>
      </Select>
    </View>
  );
}

function CustomSizeField({
  field,
  fields,
  onValueChange,
  values,
}: {
  field: ImageParamField & { spec: Extract<ImageParamField['spec'], { type: 'size' }> };
  fields: readonly ImageParamField[];
  onValueChange: (key: string, value: unknown) => void;
  values: ImageParamDraft;
}) {
  const { t } = useTranslation();
  const pairedKey = field.spec.pairedEnumKey ?? 'size';
  const hasPairedField = fields.some((candidate) => candidate.key === pairedKey);
  if (hasPairedField && values[pairedKey] !== 'custom') {
    return null;
  }

  const widthKey = `${field.key}_width`;
  const heightKey = `${field.key}_height`;
  const width = values[widthKey];
  const height = values[heightKey];
  const isInvalid =
    !isSideValid(width, field.spec.minSide, field.spec.maxSide) ||
    !isSideValid(height, field.spec.minSide, field.spec.maxSide);
  return (
    <View className="gap-2">
      <Text className="font-medium text-foreground text-sm">{imageParamLabel(t, field.key)}</Text>
      <View className="flex-row items-center gap-2">
        <Input
          accessibilityLabel={t('painting.settings.width')}
          className="h-10 min-w-0 flex-1 rounded-xl px-3 py-0 text-center"
          keyboardType="number-pad"
          onChangeText={(nextValue) => onValueChange(widthKey, nextValue)}
          placeholder={t('painting.settings.width')}
          value={width === undefined || width === null ? '' : String(width)}
          variant="secondary"
        />
        <Text className="text-default-foreground">×</Text>
        <Input
          accessibilityLabel={t('painting.settings.height')}
          className="h-10 min-w-0 flex-1 rounded-xl px-3 py-0 text-center"
          keyboardType="number-pad"
          onChangeText={(nextValue) => onValueChange(heightKey, nextValue)}
          placeholder={t('painting.settings.height')}
          value={height === undefined || height === null ? '' : String(height)}
          variant="secondary"
        />
      </View>
      <Text className={isInvalid ? 'text-danger text-xs' : 'text-default-foreground text-xs'}>
        {t('painting.settings.sizeRange', {
          max: field.spec.maxSide,
          min: field.spec.minSide,
        })}
      </Text>
    </View>
  );
}

function enumOptions(field: ImageParamField, fields: readonly ImageParamField[]): string[] {
  if (field.spec.type !== 'enum') {
    return [];
  }
  const hasCustomSize = fields.some(
    (candidate) =>
      candidate.spec.type === 'size' && (candidate.spec.pairedEnumKey ?? 'size') === field.key,
  );
  return hasCustomSize && !field.spec.options.includes('custom')
    ? [...field.spec.options, 'custom']
    : field.spec.options;
}

function RatioPreview({ value }: { value: string }) {
  const ratio = parseRatio(value);
  if (!ratio) {
    return null;
  }
  const maxWidth = 24;
  const maxHeight = 16;
  const scale = Math.min(maxWidth / ratio.width, maxHeight / ratio.height);
  return (
    <View
      className="border border-current"
      style={{ height: Math.max(5, ratio.height * scale), width: Math.max(5, ratio.width * scale) }}
    />
  );
}

/** 1024x1024 这类尺寸值化简成 1:1 展示；化简不出简洁比例或非比例值时保留原标签。 */
function ratioOptionLabel(t: TFunction, key: CanonicalParamKey, value: string): string {
  const ratio = parseRatio(value);
  if (!ratio || !Number.isInteger(ratio.width) || !Number.isInteger(ratio.height)) {
    return imageParamOptionLabel(t, key, value);
  }
  const divisor = greatestCommonDivisor(ratio.width, ratio.height);
  const width = ratio.width / divisor;
  const height = ratio.height / divisor;
  return width <= 32 && height <= 32 ? `${width}:${height}` : imageParamOptionLabel(t, key, value);
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** 等面积缩放：给定基准面积，各比例观感大小一致，再收进外壳的最大边长内。 */
function ratioShapeSize(
  ratio: { height: number; width: number },
  area: number,
  maxSide: number,
): { height: number; width: number } {
  const width = Math.sqrt((area * ratio.width) / ratio.height);
  const height = area / width;
  const scale = Math.min(1, maxSide / width, maxSide / height);
  return { height: Math.max(8, height * scale), width: Math.max(8, width * scale) };
}

function parseRatio(value: string): { height: number; width: number } | undefined {
  const normalized = value
    .replace(/^ASPECT_/i, '')
    .replace('_', ':')
    .replace('x', ':');
  const [width, height] = normalized.split(':').map(Number);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { height, width }
    : undefined;
}

function isSideValid(value: unknown, min: number, max: number): boolean {
  if (value === undefined || value === null || value === '') {
    return false;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max;
}

const numericTextKeys = new Set<CanonicalParamKey>([
  'seed',
  'maxImages',
  'numImages',
  'outputCompression',
]);

const styles = StyleSheet.create({
  chipGrid: { gap: FIELD_GAP },
  content: {
    gap: 22,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  ratioDashedShape: { borderStyle: 'dashed' },
  tabularText: { fontVariant: ['tabular-nums'] },
});

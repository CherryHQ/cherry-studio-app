import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import type { CanonicalParamKey } from '@cherrystudio/provider-registry';
import {
  BottomSheet,
  Description,
  FieldError,
  Input,
  Label,
  Section,
  Slider,
  Switch,
  TextAnimation,
  TextField,
} from '@cherrystudio/ui/components';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

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

type EnumImageParamField = ImageParamField & {
  spec: Extract<ImageParamField['spec'], { type: 'enum' }>;
};

export function PaintingSettingsBottomSheet({
  onDismiss,
  onValueChange,
  resolvedMode,
  values,
}: PaintingSettingsBottomSheetProps) {
  const { t } = useTranslation();
  const [activeEnumKey, setActiveEnumKey] = useState<CanonicalParamKey | null>(null);
  const fields = getImageParamFields(resolvedMode);
  const activeEnumField = fields.find(
    (field): field is EnumImageParamField =>
      field.key === activeEnumKey && field.spec.type === 'enum' && field.spec.render !== 'chips',
  );

  return (
    <BottomSheet
      backAction={
        activeEnumField
          ? { accessibilityLabel: t('common.back'), onPress: () => setActiveEnumKey(null) }
          : undefined
      }
      onClose={onDismiss}
      open
      size={activeEnumField ? 'medium' : 'large'}
      testID="painting-settings"
      title={
        activeEnumField ? imageParamLabel(t, activeEnumField.key) : t('painting.settings.title')
      }
    >
      {activeEnumField ? (
        <EnumSelectionPage
          field={activeEnumField}
          fields={fields}
          onValueChange={onValueChange}
          values={values}
        />
      ) : (
        <PaintingSettingsRootPage
          fields={fields}
          onValueChange={onValueChange}
          onEnumPress={setActiveEnumKey}
          values={values}
        />
      )}
    </BottomSheet>
  );
}

function PaintingSettingsRootPage({
  fields,
  onEnumPress,
  onValueChange,
  values,
}: {
  fields: readonly ImageParamField[];
  onEnumPress: (key: CanonicalParamKey) => void;
  onValueChange: (key: string, value: unknown) => void;
  values: ImageParamDraft;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const fieldWidth = Math.max(0, windowWidth - 64);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.page}
    >
      {fields.map((field) => (
        <PaintingSettingField
          field={field}
          fieldWidth={fieldWidth}
          fields={fields}
          key={field.key}
          onEnumPress={onEnumPress}
          onValueChange={onValueChange}
          values={values}
        />
      ))}
    </ScrollView>
  );
}

function PaintingSettingField({
  field,
  fieldWidth,
  fields,
  onEnumPress,
  onValueChange,
  values,
}: {
  field: ImageParamField;
  fieldWidth: number;
  fields: readonly ImageParamField[];
  onEnumPress: (key: CanonicalParamKey) => void;
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
          <EnumSettingRow
            field={{ key: field.key, spec: field.spec }}
            onPress={() => onEnumPress(field.key)}
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
      const isFixed = field.spec.max <= field.spec.min;
      return (
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-medium text-foreground text-sm">{label}</Text>
            <Text className="text-foreground text-sm" style={styles.tabularText}>
              {numericValue}
            </Text>
          </View>
          {isFixed ? null : (
            <Slider
              accessibilityLabel={label}
              max={field.spec.max}
              min={field.spec.min}
              onValueChange={(nextValue) => onValueChange(field.key, nextValue)}
              step={field.spec.step ?? 1}
              value={numericValue}
            />
          )}
        </View>
      );
    }
    case 'text':
      return (
        <TextField>
          <Label>{label}</Label>
          <Input
            accessibilityLabel={label}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={numericTextKeys.has(field.key) ? 'numbers-and-punctuation' : 'default'}
            multiline={field.spec.multiline}
            onChangeText={(nextValue) => onValueChange(field.key, nextValue)}
            placeholder={t('painting.settings.optional')}
            textAlignVertical={field.spec.multiline ? 'top' : 'center'}
            value={value === undefined || value === null ? '' : String(value)}
          />
        </TextField>
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
        <TextAnimation.Rotating
          text={headerText}
          textClassName="font-medium text-foreground text-sm"
        />
      </View>
      <Section>
        <Section.Item className="p-4">
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
        </Section.Item>
      </Section>
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
            : 'font-medium text-foreground text-sm'
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
                  ? 'h-14 items-center justify-center gap-1 rounded-lg border border-border-strong bg-secondary px-2 active:opacity-70'
                  : 'h-14 items-center justify-center gap-1 rounded-lg border border-border bg-secondary px-2 active:opacity-70'
              }
              key={option}
              onPress={() => onValueChange(field.key, option)}
              style={{ width: chipWidth }}
            >
              <RatioPreview value={option} />
              <Text className="text-foreground text-xs" numberOfLines={1}>
                {imageParamOptionLabel(t, field.key, option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function EnumSettingRow({
  field,
  onPress,
  values,
}: {
  field: EnumImageParamField;
  onPress: () => void;
  values: ImageParamDraft;
}) {
  const { t } = useTranslation();
  const label = imageParamLabel(t, field.key);
  const selectedValue = values[field.key];
  const selectedLabel =
    selectedValue === undefined
      ? t('painting.settings.select')
      : imageParamOptionLabel(t, field.key, String(selectedValue));

  return (
    <Section>
      <Section.Item
        label={label}
        onPress={onPress}
        testID={`painting-setting-${field.key}`}
        trailing={
          <View className="min-w-0 max-w-56 flex-row items-center justify-end gap-1">
            <Text className="min-w-0 shrink text-right text-base text-foreground" numberOfLines={1}>
              {selectedLabel}
            </Text>
            <ChevronRightIcon className="size-5 shrink-0 text-foreground" />
          </View>
        }
      />
    </Section>
  );
}

function EnumSelectionPage({
  field,
  fields,
  onValueChange,
  values,
}: {
  field: EnumImageParamField;
  fields: readonly ImageParamField[];
  onValueChange: (key: string, value: unknown) => void;
  values: ImageParamDraft;
}) {
  const { t } = useTranslation();
  const options = enumOptions(field, fields);
  const selectedValue = values[field.key];

  return (
    <ScrollView
      contentContainerStyle={styles.selectionContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.page}
      testID={`painting-setting-options-${field.key}`}
    >
      <Section>
        {options.map((option) => {
          const isSelected = selectedValue === option;

          return (
            <Section.RadioItem
              key={option}
              label={imageParamOptionLabel(t, field.key, option)}
              onPress={() => onValueChange(field.key, option)}
              selected={isSelected}
              testID={`painting-setting-option-${field.key}-${option}`}
            />
          );
        })}
      </Section>
    </ScrollView>
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
  const rangeDescription = t('painting.settings.sizeRange', {
    max: field.spec.maxSide,
    min: field.spec.minSide,
  });
  return (
    <TextField isInvalid={isInvalid}>
      <Label>{imageParamLabel(t, field.key)}</Label>
      <View className="flex-row items-center gap-2">
        <Input
          accessibilityLabel={t('painting.settings.width')}
          keyboardType="number-pad"
          onChangeText={(nextValue) => onValueChange(widthKey, nextValue)}
          placeholder={t('painting.settings.width')}
          style={styles.sizeInput}
          value={width === undefined || width === null ? '' : String(width)}
        />
        <Text className="text-foreground">×</Text>
        <Input
          accessibilityLabel={t('painting.settings.height')}
          keyboardType="number-pad"
          onChangeText={(nextValue) => onValueChange(heightKey, nextValue)}
          placeholder={t('painting.settings.height')}
          style={styles.sizeInput}
          value={height === undefined || height === null ? '' : String(height)}
        />
      </View>
      <Description hideOnInvalid>{rangeDescription}</Description>
      <FieldError>{rangeDescription}</FieldError>
    </TextField>
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
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  page: { flex: 1 },
  ratioDashedShape: { borderStyle: 'dashed' },
  selectionContent: { paddingBottom: 24, paddingHorizontal: 16, paddingTop: 8 },
  sizeInput: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
  },
  tabularText: { fontVariant: ['tabular-nums'] },
});

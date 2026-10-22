import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import type { CanonicalParamKey } from '@cherrystudio/provider-registry';
import {
  BottomSheet,
  Input,
  Section,
  Slider,
  Switch,
  Tabs,
  TextField,
} from '@cherrystudio/ui/components';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLayoutWidth } from '@/frontend/hooks/useLayoutWidth';
import type {
  ImageParamDraft,
  ImageParamField,
  ResolvedImageGenerationMode,
} from '@/shared/utils/imageGenerationParams';
import { getImageParamFields, parseImageRatio } from '@/shared/utils/imageGenerationParams';

import {
  imageParamLabel,
  imageParamOptionLabel,
  optionRatioLabel,
  pixelSizeLabel,
} from './imageGenerationLabels';

const FIELD_GAP = 8;
// 最多 5 列等宽网格；文字放不下时减列，并让各行数量均衡，不截断、不缩字号。
const RATIO_GRID_MAX_COLUMNS = 5;
// 外壳（选中框）固定为 5 列时的单元格宽，减列也不放大；1:1 预览方形为其一半，
// 其它比例按等面积缩放（观感大小一致），并收进外壳内边距。
const RATIO_SHELL_INSET = 20;
// Choices this short fit one segmented control; longer lists open their own page.
const MAX_SEGMENTS = 4;

type PaintingSettingsModelRow = {
  icon?: ReactNode;
  label: string;
  onPress: () => void;
  providerName?: string;
};

type PaintingSettingsBottomSheetProps = {
  /** Shown first when the caller has no model control of its own. */
  model?: PaintingSettingsModelRow;
  onDismiss: () => void;
  onValueChange: (key: string, value: unknown) => void;
  resolvedMode: ResolvedImageGenerationMode | undefined;
  values: ImageParamDraft;
};

/** One fixed order everywhere: shape, count, quality, background, then the rest. */
const FIELD_PRIORITY: readonly CanonicalParamKey[] = [
  'aspectRatio',
  'size',
  'customSize',
  'imageResolution',
  'resolution',
  'numImages',
  'maxImages',
  'quality',
  'background',
];

function orderedFields(fields: readonly ImageParamField[]): ImageParamField[] {
  const rank = (key: CanonicalParamKey) => {
    const index = FIELD_PRIORITY.indexOf(key);
    return index === -1 ? FIELD_PRIORITY.length : index;
  };
  return fields
    .map((field, index) => ({ field, index }))
    .sort((left, right) => rank(left.field.key) - rank(right.field.key) || left.index - right.index)
    .map(({ field }) => field);
}

type EnumImageParamField = ImageParamField & {
  spec: Extract<ImageParamField['spec'], { type: 'enum' }>;
};

export function PaintingSettingsBottomSheet({
  model,
  onDismiss,
  onValueChange,
  resolvedMode,
  values,
}: PaintingSettingsBottomSheetProps) {
  const { t } = useTranslation();
  const [activeEnumKey, setActiveEnumKey] = useState<CanonicalParamKey | null>(null);
  const fields = orderedFields(getImageParamFields(resolvedMode));
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
          model={model}
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
  model,
  onEnumPress,
  onValueChange,
  values,
}: {
  fields: readonly ImageParamField[];
  model?: PaintingSettingsModelRow;
  onEnumPress: (key: CanonicalParamKey) => void;
  onValueChange: (key: string, value: unknown) => void;
  values: ImageParamDraft;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.page}
    >
      {model ? <ModelRow model={model} /> : null}
      {fields.map((field) => (
        <PaintingSettingField
          field={field}
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
  fields,
  onEnumPress,
  onValueChange,
  values,
}: {
  field: ImageParamField;
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
      const options = enumOptions(field, fields);
      if (field.spec.render !== 'chips' && options.length <= MAX_SEGMENTS) {
        return (
          <SegmentedField
            label={label}
            onChange={(option) => onValueChange(field.key, option)}
            options={options.map((option) => ({
              label: imageParamOptionLabel(t, field.key, option),
              value: option,
            }))}
            value={String(value ?? field.spec.default ?? options[0])}
          />
        );
      }
      if (field.spec.render !== 'chips') {
        return (
          <EnumSettingRow
            field={{ key: field.key, spec: field.spec }}
            onPress={() => onEnumPress(field.key)}
            values={values}
          />
        );
      }
      // 比例/尺寸型字段（如 2:3、1024x1024）走截图式比例卡片；auto/custom
      // 等不可解析项在卡片里渲染成虚线占位，纯文字型字段回退普通 chips。
      return options.filter((option) => parseImageRatio(option)).length >= 2 ? (
        <AspectRatioField
          field={{ key: field.key, spec: field.spec }}
          onValueChange={onValueChange}
          options={options}
          values={values}
        />
      ) : (
        <EnumChipsField
          field={{ key: field.key, spec: field.spec }}
          fields={fields}
          onValueChange={onValueChange}
          values={values}
        />
      );
    }
    case 'range': {
      const numericValue = typeof value === 'number' ? value : Number(value ?? field.spec.min);
      const isFixed = field.spec.max <= field.spec.min;
      const step = field.spec.step ?? 1;
      const stops = Math.floor((field.spec.max - field.spec.min) / step) + 1;
      if (!isFixed && step >= 1 && stops <= MAX_SEGMENTS) {
        const { min } = field.spec;
        return (
          <SegmentedField
            label={label}
            onChange={(option) => onValueChange(field.key, Number(option))}
            options={Array.from({ length: stops }, (_, index) => {
              const option = String(min + index * step);
              return { label: option, value: option };
            })}
            value={String(numericValue)}
          />
        );
      }
      return (
        <View className="gap-3">
          <FieldHeader label={label} value={String(numericValue)} />
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
          <TextField.Label>{label}</TextField.Label>
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
  onValueChange,
  options,
  values,
}: {
  field: ImageParamField & { spec: Extract<ImageParamField['spec'], { type: 'enum' }> };
  onValueChange: (key: string, value: unknown) => void;
  options: readonly string[];
  values: ImageParamDraft;
}) {
  const { t } = useTranslation();
  const selectedValue = values[field.key];
  const { onLayout, width: gridWidth } = useLayoutWidth();
  const { onLayout: onTextLayout, width: textWidth } = useLayoutWidth();
  const cells = options.map((option) => ({
    label: optionRatioLabel(field.key, option) ?? imageParamOptionLabel(t, field.key, option),
    option,
    pixels: pixelSizeLabel(field.key, option),
  }));
  const shellSide = Math.max(
    48,
    (gridWidth - FIELD_GAP * (RATIO_GRID_MAX_COLUMNS - 1)) / RATIO_GRID_MAX_COLUMNS,
  );
  const fittingColumns = Math.floor(
    (gridWidth + FIELD_GAP) / (Math.max(shellSide, Math.ceil(textWidth)) + FIELD_GAP),
  );
  const rows = Math.ceil(
    options.length / Math.min(RATIO_GRID_MAX_COLUMNS, Math.max(1, fittingColumns)),
  );
  const columns = Math.ceil(options.length / rows);
  const cellWidth = (gridWidth - FIELD_GAP * (columns - 1)) / columns;
  return (
    <View className="gap-3">
      <FieldHeader label={imageParamLabel(t, field.key)} />
      <View className="flex-row flex-wrap" onLayout={onLayout} style={styles.chipGrid}>
        {/* Invisible copy of every cell's text; its width is the widest line a cell must hold. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLayout={onTextLayout}
          pointerEvents="none"
          style={styles.textMeasure}
        >
          {cells.map(({ label, option, pixels }) => (
            <RatioOptionText isSelected key={option} label={label} pixels={pixels} />
          ))}
        </View>
        {cells.map(({ label, option, pixels }) => (
          <AspectRatioOption
            cellWidth={cellWidth}
            isSelected={selectedValue === option}
            key={option}
            label={label}
            onPress={() => onValueChange(field.key, option)}
            pixels={pixels}
            shellSide={shellSide}
            value={option}
          />
        ))}
      </View>
    </View>
  );
}

function AspectRatioOption({
  cellWidth,
  isSelected,
  label,
  onPress,
  pixels,
  shellSide,
  value,
}: {
  cellWidth: number;
  isSelected: boolean;
  label: string;
  onPress: () => void;
  pixels?: string;
  shellSide: number;
  value: string;
}) {
  // 外壳固定正方形；1:1 预览方形恰为其一半。
  const squareSide = shellSide / 2;
  const ratio = parseImageRatio(value);
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
      accessibilityLabel={pixels ? `${label} · ${pixels}` : label}
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
      <RatioOptionText isSelected={isSelected} label={label} pixels={pixels} />
    </Pressable>
  );
}

/** Ratio, then the exact pixels when the option is a pixel size. */
function RatioOptionText({
  isSelected,
  label,
  pixels,
}: {
  isSelected: boolean;
  label: string;
  pixels?: string;
}) {
  return (
    <View className="items-center">
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
      {pixels ? (
        <Text
          className="text-muted-foreground text-xs"
          numberOfLines={1}
          style={styles.tabularText}
        >
          {pixels}
        </Text>
      ) : null}
    </View>
  );
}

function EnumChipsField({
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
  const options = enumOptions(field, fields);
  const { onLayout, width: gridWidth } = useLayoutWidth();
  const columns = Math.min(field.spec.columns ?? 3, Math.max(1, options.length));
  const chipWidth = Math.max(72, (gridWidth - FIELD_GAP * (columns - 1)) / columns);
  return (
    <View className="gap-2">
      <Text className="font-medium text-foreground text-sm">{imageParamLabel(t, field.key)}</Text>
      <View className="flex-row flex-wrap" onLayout={onLayout} style={styles.chipGrid}>
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

function ModelRow({ model }: { model: PaintingSettingsModelRow }) {
  const { t } = useTranslation();
  return (
    <NavigationRow
      label={t('painting.settings.model')}
      leading={model.icon}
      onPress={model.onPress}
      testID="painting-setting-model"
      value={model.label}
    />
  );
}

/** A choice that opens elsewhere: label on the left, current value and chevron on the right. */
function NavigationRow({
  label,
  leading,
  onPress,
  testID,
  value,
}: {
  label: string;
  leading?: ReactNode;
  onPress: () => void;
  testID?: string;
  value: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="button"
      className="min-h-11 flex-row items-center gap-3 active:opacity-70"
      onPress={onPress}
      testID={testID}
    >
      <Text className="font-medium text-foreground text-sm">{label}</Text>
      <View className="min-w-0 flex-1 flex-row items-center justify-end gap-2">
        {leading}
        <Text className="min-w-0 shrink text-muted-foreground text-sm" numberOfLines={1}>
          {value}
        </Text>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </View>
    </Pressable>
  );
}

function FieldHeader({ label, value }: { label: string; value?: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="font-medium text-foreground text-sm">{label}</Text>
      {value ? (
        <Text className="text-muted-foreground text-sm" style={styles.tabularText}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

function SegmentedField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  value: string;
}) {
  return (
    <View className="gap-3">
      <FieldHeader label={label} />
      <Tabs accessibilityLabel={label} items={options} onValueChange={onChange} value={value} />
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
  // An unset value means the model's own default applies; say which.
  const selectedValue = values[field.key] ?? field.spec.default;
  return (
    <NavigationRow
      label={imageParamLabel(t, field.key)}
      onPress={onPress}
      testID={`painting-setting-${field.key}`}
      value={
        selectedValue === undefined
          ? t('painting.settings.option.auto')
          : imageParamOptionLabel(t, field.key, String(selectedValue))
      }
    />
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
      <Section variant="plain">
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
    <TextField invalid={isInvalid}>
      <TextField.Label>{imageParamLabel(t, field.key)}</TextField.Label>
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
      <TextField.Description>{rangeDescription}</TextField.Description>
      <TextField.Error>{rangeDescription}</TextField.Error>
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
  const ratio = parseImageRatio(value);
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
  selectionContent: { paddingBottom: 24, paddingTop: 8 },
  sizeInput: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
  },
  tabularText: { fontVariant: ['tabular-nums'] },
  textMeasure: { left: 0, opacity: 0, position: 'absolute', top: 0 },
});

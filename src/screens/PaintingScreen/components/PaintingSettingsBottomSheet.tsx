import type { CanonicalParamKey } from '@cherrystudio/provider-registry';
import { ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import { GlassView } from 'expo-glass-effect';
import { Input } from 'heroui-native/input';
import { Select } from 'heroui-native/select';
import { Slider } from 'heroui-native/slider';
import { Switch } from 'heroui-native/switch';
import { ChevronDownIcon, XIcon } from 'lucide-uniwind/png';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  isLiquidGlassAvailable,
  paintingSheetOuterInset,
  sheetScrimColor,
} from '@/config/constants';

import { imageParamLabel, imageParamOptionLabel } from '../utils/imageGenerationLabels';
import type {
  ImageParamDraft,
  ImageParamField,
  ResolvedImageGenerationMode,
} from '../utils/imageGenerationParams';
import { getImageParamFields } from '../utils/imageGenerationParams';

const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;
const HEADER_HEIGHT = 60;
const HEADER_SIDE_WIDTH = 44;
const SHEET_CORNER_RADIUS = 28;
const FIELD_GAP = 8;

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
  const [sheetIndex, setSheetIndex] = useState(OPEN_INDEX);
  const didDismissRef = useRef(false);
  const fields = getImageParamFields(resolvedMode);
  const sheetWidth = Math.max(0, windowWidth - paintingSheetOuterInset * 2);
  const availableHeight = windowHeight - insets.top - insets.bottom - paintingSheetOuterInset * 2;
  const sheetHeight = Math.min(680, Math.max(360, availableHeight * 0.78));
  const fieldWidth = Math.max(0, sheetWidth - 48);
  const sheetBottomCornerRadius = Math.max(
    SHEET_CORNER_RADIUS,
    insets.bottom + paintingSheetOuterInset,
  );
  const sheetTopCornerRadius = Math.max(
    SHEET_CORNER_RADIUS,
    sheetBottomCornerRadius - paintingSheetOuterInset,
  );
  const sheetCornerStyle = {
    borderBottomLeftRadius: sheetBottomCornerRadius,
    borderBottomRightRadius: sheetBottomCornerRadius,
    borderTopLeftRadius: sheetTopCornerRadius,
    borderTopRightRadius: sheetTopCornerRadius,
  };
  const headerInset = Math.max(0, sheetTopCornerRadius - HEADER_SIDE_WIDTH / 2);
  const headerStyle = {
    height: Math.max(HEADER_HEIGHT, headerInset + HEADER_SIDE_WIDTH),
    paddingHorizontal: headerInset,
    paddingTop: headerInset,
  };

  const requestClose = useCallback(() => setSheetIndex(CLOSED_INDEX), []);
  const handleSettle = useCallback(
    (nextIndex: number) => {
      if (nextIndex !== CLOSED_INDEX || didDismissRef.current) {
        return;
      }
      didDismissRef.current = true;
      onDismiss();
    },
    [onDismiss],
  );

  return (
    <ModalBottomSheet
      detents={[0, 'content']}
      index={sheetIndex}
      onIndexChange={setSheetIndex}
      onSettle={handleSettle}
      scrimColor={sheetScrimColor}
    >
      <View style={styles.sheetLayout}>
        <View
          style={[styles.sheet, sheetCornerStyle, { height: sheetHeight, width: sheetWidth }]}
          testID="painting-settings-sheet"
        >
          {isLiquidGlassAvailable ? (
            <GlassView
              glassEffectStyle="regular"
              style={[styles.surface, sheetCornerStyle]}
              testID="painting-settings-sheet-surface"
            />
          ) : (
            <View
              className="bg-background"
              style={[styles.surface, sheetCornerStyle]}
              testID="painting-settings-sheet-surface"
            />
          )}

          <View
            className="flex-row items-center"
            style={headerStyle}
            testID="painting-settings-header"
          >
            {isLiquidGlassAvailable ? (
              <GlassView glassEffectStyle="regular" isInteractive style={styles.closeSurface}>
                <SettingsCloseButton onPress={requestClose} />
              </GlassView>
            ) : (
              <View className="bg-surface-secondary" style={styles.closeSurface}>
                <SettingsCloseButton onPress={requestClose} />
              </View>
            )}
            <Text
              className="flex-1 px-3 text-center font-semibold text-foreground text-base"
              numberOfLines={1}
            >
              {t('painting.settings.title')}
            </Text>
            <View style={styles.headerSide} />
          </View>

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
        </View>
        <View style={styles.sheetBottomGap} testID="painting-settings-sheet-bottom-gap" />
      </View>
    </ModalBottomSheet>
  );
}

function SettingsCloseButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityLabel={t('painting.settings.close')}
      accessibilityRole="button"
      className="h-full w-full items-center justify-center rounded-full active:opacity-60"
      hitSlop={8}
      onPress={onPress}
      testID="painting-settings-close"
    >
      <XIcon className="size-5 text-foreground" strokeWidth={2.25} />
    </Pressable>
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
            isSelected={Boolean(value)}
            onSelectedChange={(selected) => onValueChange(field.key, selected)}
          />
        </View>
      );
    case 'enum':
      return field.spec.render === 'chips' ? (
        <EnumChipsField
          field={{ key: field.key, spec: field.spec }}
          fieldWidth={fieldWidth}
          fields={fields}
          onValueChange={onValueChange}
          values={values}
        />
      ) : (
        <EnumSelectField
          field={{ key: field.key, spec: field.spec }}
          fields={fields}
          onValueChange={onValueChange}
          values={values}
        />
      );
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
            maxValue={field.spec.max}
            minValue={field.spec.min}
            onChange={(nextValue) =>
              onValueChange(field.key, Array.isArray(nextValue) ? nextValue[0] : nextValue)
            }
            step={field.spec.step ?? 1}
            value={numericValue}
          >
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
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
                  ? 'h-14 items-center justify-center gap-1 rounded-lg border border-accent bg-accent/10 px-2 active:opacity-70'
                  : 'h-14 items-center justify-center gap-1 rounded-lg border border-border bg-surface-secondary px-2 active:opacity-70'
              }
              key={option}
              onPress={() => onValueChange(field.key, option)}
              style={{ width: chipWidth }}
            >
              <RatioPreview value={option} />
              <Text
                className={isSelected ? 'text-accent text-xs' : 'text-foreground text-xs'}
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
  closeSurface: {
    borderCurve: 'continuous',
    borderRadius: HEADER_SIDE_WIDTH / 2,
    height: HEADER_SIDE_WIDTH,
    overflow: 'hidden',
    width: HEADER_SIDE_WIDTH,
  },
  content: {
    gap: 22,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  headerSide: { height: HEADER_SIDE_WIDTH, width: HEADER_SIDE_WIDTH },
  sheet: {
    borderCurve: 'continuous',
    borderRadius: SHEET_CORNER_RADIUS,
    overflow: 'hidden',
  },
  sheetBottomGap: { height: paintingSheetOuterInset },
  sheetLayout: { alignItems: 'center' },
  surface: {
    borderCurve: 'continuous',
    borderRadius: SHEET_CORNER_RADIUS,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  tabularText: { fontVariant: ['tabular-nums'] },
});

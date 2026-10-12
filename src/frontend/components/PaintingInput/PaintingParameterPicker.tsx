import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ImagesIcon from '@cherrystudio/app-icons/icons/images';
import { Slider } from '@cherrystudio/ui/components';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { ImageParamField } from '@/shared/utils/imageGenerationParams';

import { imageParamLabel, imageParamOptionLabel } from './imageGenerationLabels';

export function supportsPaintingParameterPicker(field: ImageParamField) {
  return field.spec.type === 'enum' || field.spec.type === 'range';
}

/** One registry-owned parameter at a time, on the composer's shared menu surface. */
export function PaintingParameterPicker({
  field,
  focusRef,
  onSelect,
  value,
}: {
  field: ImageParamField;
  focusRef: RefObject<View | null>;
  onSelect: (value: unknown) => void;
  value: unknown;
}) {
  const { t } = useTranslation();
  const label = imageParamLabel(t, field.key);
  const spec = field.spec;

  if (spec.type === 'range' && (spec.max - spec.min > 12 || (spec.step ?? 1) < 1)) {
    const numericValue = Number(value ?? spec.default ?? spec.min);
    const sliderValue = Number.isFinite(numericValue)
      ? Math.max(spec.min, Math.min(spec.max, numericValue))
      : spec.min;
    return (
      <View className="gap-4 p-4">
        <View
          className="flex-row items-center justify-between gap-4"
          ref={focusRef}
          accessible
          accessibilityLabel={label}
        >
          <Text className="font-medium text-foreground text-sm">{label}</Text>
          <Text className="text-muted-foreground text-sm">{String(value ?? spec.min)}</Text>
        </View>
        <Slider
          accessibilityLabel={label}
          max={spec.max}
          min={spec.min}
          onValueChange={onSelect}
          step={spec.step ?? 1}
          value={sliderValue}
        />
      </View>
    );
  }

  const options =
    spec.type === 'enum'
      ? spec.options
      : spec.type === 'range'
        ? Array.from(
            { length: Math.floor((spec.max - spec.min) / (spec.step ?? 1)) + 1 },
            (_, index) => spec.min + index * (spec.step ?? 1),
          )
        : [];

  return (
    <ScrollView
      contentContainerClassName="gap-0.5 p-2"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text className="px-3 py-2 font-medium text-muted-foreground text-xs">{label}</Text>
      {options.map((option, index) => {
        const selected = value === option;
        return (
          <Pressable
            accessibilityLabel={imageParamOptionLabel(t, field.key, String(option))}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            className={
              selected
                ? 'min-h-12 flex-row items-center gap-3 rounded-2xl bg-secondary px-3 py-2'
                : 'min-h-12 flex-row items-center gap-3 rounded-2xl px-3 py-2 active:bg-secondary'
            }
            key={String(option)}
            onPress={() => onSelect(option)}
            ref={index === 0 ? focusRef : undefined}
          >
            {field.key === 'numImages' || field.key === 'maxImages' ? (
              <ImagesIcon className="size-5 text-muted-foreground" />
            ) : (
              <PaintingRatioShape value={String(option)} />
            )}
            <Text className="min-w-0 flex-1 text-foreground text-sm">
              {imageParamOptionLabel(t, field.key, String(option))}
            </Text>
            <View className="size-4" accessible={false}>
              {selected ? <CheckIcon className="size-4 text-foreground" /> : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function PaintingRatioShape({ value }: { value: string }) {
  const dimensions = value.split(/[:x×]/).map(Number);
  const ratio =
    dimensions.length === 2 && dimensions.every((side) => Number.isFinite(side) && side > 0)
      ? dimensions[0] / dimensions[1]
      : undefined;
  if (!ratio) return null;
  return (
    <View className="size-6 items-center justify-center" accessible={false}>
      <View
        className="rounded-xs border-[1.5px] border-foreground"
        style={{ height: ratio > 1 ? 20 / ratio : 20, width: ratio > 1 ? 20 : 20 * ratio }}
      />
    </View>
  );
}

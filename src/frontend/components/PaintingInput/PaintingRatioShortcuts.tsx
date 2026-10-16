import { Composer, useComposerExpansion } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  type ImageParamDraft,
  parseImageRatio,
  type ResolvedImageGenerationMode,
} from '@/shared/utils/imageGenerationParams';

import { paintingResizeOptions } from './paintingResizeOptions';

/** One quiet row of model-supported shapes, attached to the next editing request. */
export function PaintingRatioShortcuts({
  mode,
  onSelect,
  values,
  visible,
}: {
  mode: ResolvedImageGenerationMode | undefined;
  onSelect: (choice: ReturnType<typeof paintingResizeOptions>[number]) => void;
  values: ImageParamDraft;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const isEditorPresented = useComposerExpansion()?.state.isPresented ?? false;
  const choices = paintingResizeOptions(mode);

  return (
    <Composer.ExpansionMeasure>
      {visible && !isEditorPresented && choices.length > 1 ? (
        <View className="pb-2">
          <ScrollView
            alwaysBounceHorizontal={false}
            contentContainerClassName="items-center gap-2 py-0.5"
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            testID="painting-ratio-shortcuts"
          >
            {choices.map((choice) => {
              const ratio = parseImageRatio(choice.ratio)!;
              const scale = 18 / Math.max(ratio.width, ratio.height);
              const isSelected = Object.keys(choice.paramValues).some((key) => {
                const current = parseImageRatio(values[key]);
                return (
                  current !== undefined &&
                  current.width * ratio.height === current.height * ratio.width
                );
              });
              return (
                <Pressable
                  accessibilityLabel={
                    choice.pixels
                      ? t('painting.focus.resizeToPixels', {
                          pixels: choice.pixels,
                          ratio: choice.ratio,
                        })
                      : t('painting.focus.resizeTo', { ratio: choice.ratio })
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  className={
                    isSelected
                      ? 'min-h-10 min-w-20 flex-row items-center justify-center gap-2 rounded-full border border-foreground bg-foreground px-3 py-2 active:opacity-70'
                      : 'min-h-10 min-w-20 flex-row items-center justify-center gap-2 rounded-full border border-border-strong bg-card/95 px-3 py-2 active:opacity-70'
                  }
                  hitSlop={2}
                  key={choice.ratio}
                  onPress={() => onSelect(choice)}
                  testID={`painting-ratio-${choice.ratio}`}
                >
                  <View className="size-5 items-center justify-center" pointerEvents="none">
                    <View
                      className={
                        isSelected
                          ? 'rounded-xs border border-background bg-background/20'
                          : 'rounded-xs border border-muted-foreground bg-secondary'
                      }
                      style={{
                        height: Math.max(5, ratio.height * scale),
                        width: Math.max(5, ratio.width * scale),
                      }}
                    />
                  </View>
                  <Text
                    className={
                      isSelected
                        ? 'font-medium text-background text-xs'
                        : 'font-medium text-card-foreground text-xs'
                    }
                    numberOfLines={1}
                  >
                    {choice.ratio}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </Composer.ExpansionMeasure>
  );
}

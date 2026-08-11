import { ImageGenerationLoader } from '@cherrystudio/ui/components';
import { RotateCcwIcon } from 'lucide-uniwind/png';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { Image } from '@/frontend/components/nativePrimitives';

import type {
  PaintingGenerationStatus,
  PaintingInterruption,
} from '../hooks/usePaintingGeneration';

type PaintingOutput = { fileEntryId: string; uri: string };

export function PaintingCanvas({
  aspectRatio,
  error,
  interruption,
  outputs,
  prompt,
  resolution,
  status,
}: {
  aspectRatio: number;
  error: Error | null;
  interruption: PaintingInterruption | null;
  outputs: readonly PaintingOutput[];
  prompt: string;
  resolution: string;
  status: PaintingGenerationStatus;
}) {
  const { t } = useTranslation();
  const [previewLayout, setPreviewLayout] = useState({ height: 0, width: 0 });
  const currentOutput = outputs[0];
  const hasPreviewLayout = previewLayout.height > 0 && previewLayout.width > 0;
  const handlePreviewLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const next = nativeEvent.layout;
    setPreviewLayout((current) =>
      current.height === next.height && current.width === next.width
        ? current
        : { height: next.height, width: next.width },
    );
  };

  return (
    <View className="min-h-0 flex-1 items-center justify-center px-4 pb-3 pt-2">
      {/* The request ratio sizes all three states before an output exists, so
          decoding the generated image cannot reflow the canvas. */}
      <View
        onLayout={status === 'generating' ? handlePreviewLayout : undefined}
        style={[styles.preview, { aspectRatio }]}
      >
        {status === 'generating' ? (
          hasPreviewLayout ? (
            <ImageGenerationLoader
              height={previewLayout.height}
              label={t('painting.status.generating')}
              prompt={prompt}
              resolution={resolution}
              testID="painting-generation-loader"
              width={previewLayout.width}
            />
          ) : null
        ) : currentOutput ? (
          <View
            className="relative h-full w-full overflow-hidden rounded-xl border-continuous bg-card"
            testID="painting-output-frame"
          >
            <Image
              accessibilityLabel={t('painting.output')}
              cachePolicy="memory-disk"
              contentFit="contain"
              source={currentOutput.uri}
              style={styles.outputImage}
              testID={`painting-output-${currentOutput.fileEntryId}`}
              transition={180}
            />
            <View
              className="absolute inset-0 rounded-xl border border-border border-continuous"
              pointerEvents="none"
            />
          </View>
        ) : interruption ? (
          // The gallery tile truncates the provider's words to two lines; this
          // is where they can be read in full, next to the input that retries.
          <View
            className="flex-1 items-center justify-center gap-2 px-6"
            testID="painting-interrupted"
          >
            <RotateCcwIcon className="size-7 text-foreground-tertiary" strokeWidth={1.5} />
            <Text className="text-center font-medium text-foreground-secondary text-sm">
              {t('painting.status.interrupted')}
            </Text>
            <Text className="text-center text-foreground-tertiary text-xs">
              {interruption.message ?? t('painting.status.interruptedHint')}
            </Text>
          </View>
        ) : null}
      </View>
      {error && !interruption ? (
        <Text
          accessibilityRole="alert"
          className="pt-2 text-center text-destructive text-sm"
          testID="painting-generation-error"
        >
          {t('painting.status.failed')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outputImage: {
    height: '100%',
    width: '100%',
  },
  preview: {
    width: '100%',
  },
});

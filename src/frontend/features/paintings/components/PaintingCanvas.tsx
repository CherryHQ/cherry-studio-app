import { useImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';

import { Image } from '@/frontend/components/nativePrimitives';
import { PaintingSkeleton } from '@/frontend/components/paintingSkeleton';
import { paintingSkeleton } from '@/utils/constants';

import type { PaintingGenerationStatus } from '../hooks/usePaintingGeneration';

type PaintingOutput = { fileEntryId: string; uri: string };

export function PaintingCanvas({
  error,
  onRevealFinish,
  outputs,
  status,
}: {
  error: Error | null;
  onRevealFinish: () => void;
  outputs: readonly PaintingOutput[];
  status: PaintingGenerationStatus;
}) {
  const { t } = useTranslation();
  const [previewWidth, setPreviewWidth] = useState(0);
  const currentOutput = outputs[0];

  return (
    <View className="min-h-0 flex-1 items-center justify-center px-4 pb-3 pt-2">
      {/* Keep the skeleton / reveal / result in one centered ~half-height square
          so the loading grid stays a compact preview rather than filling the
          whole canvas, and the three states never jump in size between each
          other. */}
      <View
        className="overflow-hidden"
        onLayout={({ nativeEvent }) => setPreviewWidth(nativeEvent.layout.width)}
        style={styles.preview}
      >
        {status === 'generating' ? (
          <PaintingSkeleton
            accessibilityLabel={t('painting.status.generating')}
            testID="painting-loading-skeleton"
          />
        ) : status === 'revealing' && currentOutput ? (
          <PaintingReveal
            key={currentOutput.fileEntryId}
            onFinish={onRevealFinish}
            uri={currentOutput.uri}
          />
        ) : outputs.length > 0 ? (
          <ScrollView
            contentContainerStyle={styles.outputList}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            testID="painting-output-gallery"
          >
            {outputs.map((output) => (
              <View className="h-full" key={output.fileEntryId} style={{ width: previewWidth }}>
                <Image
                  accessibilityLabel={t('painting.output')}
                  cachePolicy="memory-disk"
                  contentFit="contain"
                  source={output.uri}
                  style={styles.outputImage}
                  testID={`painting-output-${output.fileEntryId}`}
                  transition={180}
                />
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          className="pt-2 text-center text-danger text-sm"
          testID="painting-generation-error"
        >
          {t('painting.status.failed')}
        </Text>
      ) : null}
    </View>
  );
}

function PaintingReveal({ onFinish, uri }: { onFinish: () => void; uri: string }) {
  const { t } = useTranslation();
  const image = useImage(uri);
  const revealSeconds = useSharedValue(-1);

  useEffect(() => {
    if (!image) {
      return;
    }
    revealSeconds.value = 0;
    revealSeconds.value = withTiming(
      paintingSkeleton.reveal.endSeconds,
      { duration: paintingSkeleton.reveal.endSeconds * 1000 },
      (finished) => {
        if (finished) {
          runOnJS(onFinish)();
        }
      },
    );
  }, [image, onFinish, revealSeconds]);

  return (
    <PaintingSkeleton
      accessibilityLabel={t('painting.status.revealing')}
      image={image}
      reveal={revealSeconds}
      testID="painting-result-reveal"
    />
  );
}

const styles = StyleSheet.create({
  outputImage: {
    height: '100%',
    width: '100%',
  },
  outputList: {
    alignItems: 'stretch',
  },
  // Half the canvas height, kept square via aspectRatio so the width follows.
  preview: {
    aspectRatio: 1,
    height: '50%',
  },
});

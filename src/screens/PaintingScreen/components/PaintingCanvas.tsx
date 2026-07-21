import { useImage } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { runOnJS, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { Image } from '@/components/nativePrimitives';
import { PaintingSkeleton, type RevealCycle } from '@/components/paintingSkeleton';
import { paintingSkeleton } from '@/config/constants';

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
  const { width: windowWidth } = useWindowDimensions();
  const currentOutput = outputs[0];
  const outputWidth = windowWidth - 32;

  return (
    <View className="min-h-0 flex-1 px-4 pb-3 pt-2">
      <View className="min-h-0 flex-1 overflow-hidden">
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
              <View className="h-full" key={output.fileEntryId} style={{ width: outputWidth }}>
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
  const reveal = useDerivedValue<RevealCycle>(() => ({
    fieldAlpha: 1,
    reveal: revealSeconds.value,
  }));

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
      reveal={reveal}
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
});

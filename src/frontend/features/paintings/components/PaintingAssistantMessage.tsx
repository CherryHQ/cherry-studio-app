import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import { Image, ImageGenerationLoader } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ArtifactPreviewLink } from '@/frontend/components/artifactPreview';

import type {
  PaintingGenerationStatus,
  PaintingInterruption,
} from '../hooks/usePaintingGeneration';

type PaintingOutput = { fileEntryId: string; uri: string };

const resultFadeMotion = {
  duration: duration.fast,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

export function PaintingAssistantMessage({
  animateOutput = false,
  aspectRatio,
  error,
  interruption,
  outputs,
  paintingId,
  resolution,
  status,
}: {
  animateOutput?: boolean;
  aspectRatio: number;
  error: Error | null;
  interruption: PaintingInterruption | null;
  outputs: readonly PaintingOutput[];
  paintingId?: string;
  resolution: string;
  status: PaintingGenerationStatus;
}) {
  const { t } = useTranslation();
  const [previewWidth, setPreviewWidth] = useState(0);
  const [isFadeComplete, setIsFadeComplete] = useState(false);
  const reducedMotion = useReducedMotion();
  const resultOpacity = useSharedValue(status === 'generating' ? 0 : 1);
  const handlePreviewLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const nextWidth = nativeEvent.layout.width;
    setPreviewWidth((current) => (current === nextWidth ? current : nextWidth));
  };

  useEffect(() => {
    if (status === 'generating') {
      resultOpacity.set(0);
    }

    return () => cancelAnimation(resultOpacity);
  }, [resultOpacity, status]);

  const completeFade = useCallback(() => setIsFadeComplete(true), []);
  const handleResultDisplay = useCallback(() => {
    if (!animateOutput || isFadeComplete) {
      return;
    }
    if (reducedMotion) {
      resultOpacity.set(1);
      completeFade();
      return;
    }
    resultOpacity.set(
      withTiming(1, resultFadeMotion, (finished) => {
        if (finished) {
          scheduleOnRN(completeFade);
        }
      }),
    );
  }, [animateOutput, completeFade, isFadeComplete, reducedMotion, resultOpacity]);
  const handleResultError = useCallback(() => {
    resultOpacity.set(1);
    completeFade();
  }, [completeFade, resultOpacity]);
  const resultStyle = useAnimatedStyle(() => ({ opacity: resultOpacity.get() }));

  const failureMessage = error?.message ?? interruption?.message;
  if (status !== 'generating' && (error || interruption)) {
    return (
      <View className="w-full">
        <View className="flex-row items-start gap-2 rounded-md border border-border bg-card p-3">
          <CircleAlertIcon className="mt-0.5 size-5 text-destructive" />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text accessibilityRole="alert" className="font-medium text-foreground text-sm">
              {interruption ? t('painting.status.interrupted') : t('painting.status.failed')}
            </Text>
            <Text className="text-foreground-tertiary text-xs">
              {failureMessage || t('painting.status.interruptedHint')}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const visibleOutputs = status === 'generating' ? [] : outputs;
  if (visibleOutputs.length === 0 && status !== 'generating') {
    return null;
  }

  const isTransitioning = animateOutput && !isFadeComplete;
  const showLoader = status === 'generating' || isTransitioning;
  const isResultInteractive = !animateOutput || isFadeComplete;
  const results = visibleOutputs.map((output, index) => {
    const result = (
      <Pressable
        accessibilityLabel={t('painting.output')}
        accessibilityElementsHidden={!isResultInteractive}
        accessibilityRole={paintingId ? 'button' : 'image'}
        className="relative h-full w-full overflow-hidden rounded-xl border-continuous bg-card active:opacity-80"
        importantForAccessibility={isResultInteractive ? 'auto' : 'no-hide-descendants'}
        pointerEvents={isResultInteractive ? 'auto' : 'none'}
        testID={`painting-output-${output.fileEntryId}`}
      >
        <Image
          cachePolicy="memory-disk"
          contentFit="contain"
          onDisplay={index === 0 ? handleResultDisplay : undefined}
          onError={index === 0 ? handleResultError : undefined}
          source={output.uri}
          style={StyleSheet.absoluteFill}
          testID={`painting-result-image-${output.fileEntryId}`}
        />
        <View
          className="absolute inset-0 rounded-xl border border-border border-continuous"
          pointerEvents="none"
        />
      </Pressable>
    );

    return (
      <View className="w-full" key={output.fileEntryId} style={{ aspectRatio }}>
        {paintingId ? (
          <ArtifactPreviewLink
            href={{
              pathname: '/paintings/[paintingId]',
              params: { fileEntryId: output.fileEntryId, paintingId },
            }}
          >
            {result}
          </ArtifactPreviewLink>
        ) : (
          result
        )}
      </View>
    );
  });

  return (
    <View className="w-full">
      <View className="relative w-full" onLayout={handlePreviewLayout}>
        {showLoader ? (
          previewWidth > 0 ? (
            <View className={isTransitioning ? 'absolute left-0 right-0 top-0' : undefined}>
              <ImageGenerationLoader
                active={status === 'generating'}
                height={previewWidth / aspectRatio}
                label={t('painting.status.generating')}
                resolution={resolution}
                testID="painting-generation-loader"
                width={previewWidth}
              />
            </View>
          ) : status === 'generating' ? (
            <View style={{ aspectRatio }} />
          ) : null
        ) : null}
        {results.length > 0 ? (
          <Animated.View className="w-full gap-3" style={animateOutput ? resultStyle : undefined}>
            {results}
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
